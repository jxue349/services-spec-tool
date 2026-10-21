#!/usr/bin/env python3
"""Publish a checked main commit and change only the deployed stack's image."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

from deploy import ACCOUNT, REGION, ROOT, run

REPOSITORY = 'wyzelabs-inc/KB-Spec-explorer'
ECR = f'{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/internal-specs'
STACK = 'internal-specs-service'
CLUSTER = 'wyze-internal'
SERVICE = 'internal-specs'


def aws(*args):
    raw = run(['aws', *args, '--region', REGION, '--output', 'json'])
    return json.loads(raw) if raw.strip() else {}


def image_parameters(parameters, image):
    if not re.fullmatch(re.escape(ECR) + r'@sha256:[a-f0-9]{64}', image):
        raise RuntimeError('Expected a digest in the Internal Specs ECR repository')
    if 'ImageUri' not in {p['ParameterKey'] for p in parameters}:
        raise RuntimeError('Service stack has no ImageUri parameter')
    return [dict(ParameterKey=p['ParameterKey'], **(
        {'ParameterValue': image} if p['ParameterKey'] == 'ImageUri'
        else {'UsePreviousValue': True}
    )) for p in parameters]


def validate_changes(change):
    if change.get('Status') != 'CREATE_COMPLETE' or change.get('ExecutionStatus') != 'AVAILABLE':
        raise RuntimeError('Release change set is not executable')
    changes = [c['ResourceChange'] for c in change.get('Changes', [])]
    if {c['LogicalResourceId'] for c in changes} != {'TaskDefinition', 'Service'}:
        raise RuntimeError('Release must change only TaskDefinition and Service')
    for resource in changes:
        task = resource['LogicalResourceId'] == 'TaskDefinition'
        expected_type = 'AWS::ECS::TaskDefinition' if task else 'AWS::ECS::Service'
        expected_property = 'ContainerDefinitions' if task else 'TaskDefinition'
        if (resource['Action'] != 'Modify' or resource['ResourceType'] != expected_type
                or resource.get('Replacement') != ('True' if task else 'False')
                or resource.get('Scope') != ['Properties'] or not resource.get('Details')):
            raise RuntimeError('Unexpected release resource action')
        for detail in resource['Details']:
            target = detail.get('Target', {})
            if target.get('Attribute') != 'Properties' or target.get('Name') != expected_property:
                raise RuntimeError('Release would change a non-image service property')


def require_clean_scan(scan):
    if scan.get('imageScanStatus', {}).get('status') != 'COMPLETE':
        raise RuntimeError('ECR scan must complete before deployment')
    findings = scan.get('imageScanFindings', {}).get('findingSeverityCounts')
    if not isinstance(findings, dict):
        raise RuntimeError('ECR scan did not return severity counts')
    if any(findings.get(level, 0) for level in ('CRITICAL', 'HIGH')):
        raise RuntimeError('ECR scan contains high or critical vulnerabilities')


def current_main(sha):
    current = run(['gh', 'api', f'repos/{REPOSITORY}/git/ref/heads/main', '--jq', '.object.sha']).strip()
    return current == sha


def publish(sha, run_id, attempt):
    tag = f'{ECR}:{sha}-{run_id}-{attempt}'
    subprocess.run(['docker', 'buildx', 'build', '--platform', 'linux/amd64',
                    '--provenance=false', '--load', '--label',
                    f'org.opencontainers.image.revision={sha}', '-t', tag, '.'], cwd=ROOT, check=True)
    password = run(['aws', 'ecr', 'get-login-password', '--region', REGION])
    run(['docker', 'login', '--username', 'AWS', '--password-stdin', ECR.split('/')[0]], input=password)
    del password
    subprocess.run(['docker', 'push', tag], cwd=ROOT, check=True)
    tag_value = tag.rsplit(':', 1)[1]
    image = aws('ecr', 'describe-images', '--repository-name', SERVICE,
                '--image-ids', f'imageTag={tag_value}')['imageDetails'][0]
    digest = image['imageDigest']
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        try:
            scan = aws('ecr', 'describe-image-scan-findings', '--repository-name', SERVICE,
                       '--image-id', f'imageDigest={digest}')
        except RuntimeError as error:
            if 'ScanNotFoundException' not in str(error):
                raise
            time.sleep(5)
            continue
        if scan.get('imageScanStatus', {}).get('status') in ('PENDING', 'IN_PROGRESS'):
            time.sleep(5)
            continue
        require_clean_scan(scan)
        print(json.dumps({'image': f'{ECR}@{digest}', 'scan': scan['imageScanStatus'],
                          'findings': scan['imageScanFindings']['findingSeverityCounts']}), flush=True)
        return f'{ECR}@{digest}'
    raise RuntimeError('Timed out waiting for the ECR scan; service was not changed')


def verify(image):
    service = aws('ecs', 'describe-services', '--cluster', CLUSTER, '--services', SERVICE)['services'][0]
    desired = service['desiredCount']
    deployments = service.get('deployments', [])
    if (desired < 1 or service['runningCount'] != desired or service['pendingCount']
            or len(deployments) != 1 or deployments[0].get('rolloutState') != 'COMPLETED'):
        raise RuntimeError('ECS service has not reached the desired healthy deployment')
    definition = aws('ecs', 'describe-task-definition', '--task-definition', service['taskDefinition'])['taskDefinition']
    containers = {c['name']: c for c in definition['containerDefinitions']}
    if containers['web']['image'] != image:
        raise RuntimeError('ECS is serving a different image (possibly a circuit-breaker rollback)')
    arns = aws('ecs', 'list-tasks', '--cluster', CLUSTER, '--service-name', SERVICE,
               '--desired-status', 'RUNNING')['taskArns']
    if len(arns) != desired:
        raise RuntimeError('Unexpected running task count')
    task_result = aws('ecs', 'describe-tasks', '--cluster', CLUSTER, '--tasks', *arns)
    tasks = task_result['tasks']
    if task_result.get('failures') or len(tasks) != desired:
        raise RuntimeError('Could not inspect every running task')
    addresses = set()
    for task in tasks:
        web = next(c for c in task['containers'] if c['name'] == 'web')
        if (task['lastStatus'] != 'RUNNING' or task.get('healthStatus') != 'HEALTHY'
                or task['taskDefinitionArn'] != service['taskDefinition']
                or web.get('imageDigest') != image.split('@')[1]):
            raise RuntimeError('A running task is unhealthy or uses a different release')
        addresses.update(d['value'] for a in task['attachments'] for d in a.get('details', [])
                         if d['name'] == 'privateIPv4Address')
    target_group = service['loadBalancers'][0]['targetGroupArn']
    targets = aws('elbv2', 'describe-target-health', '--target-group-arn', target_group)['TargetHealthDescriptions']
    healthy = {t['Target']['Id'] for t in targets if t['TargetHealth']['State'] == 'healthy'}
    if len(addresses) != desired or not addresses.issubset(healthy):
        raise RuntimeError('Not every running task has a healthy ALB target')
    if len({t['availabilityZone'] for t in tasks}) < min(2, desired):
        raise RuntimeError('Tasks are not spread across the expected AZs')
    return {'image': image, 'taskDefinition': service['taskDefinition'], 'healthyTasks': desired}


def deploy_image(image, sha, run_id, attempt):
    stack = aws('cloudformation', 'describe-stacks', '--stack-name', STACK)['Stacks'][0]
    if stack['StackStatus'] not in ('CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'):
        raise RuntimeError('Service stack is busy or needs recovery')
    if stack.get('RoleARN'):
        raise RuntimeError('Review CI permissions before using a CloudFormation service role')
    previous = next(p['ParameterValue'] for p in stack['Parameters'] if p['ParameterKey'] == 'ImageUri')
    if not current_main(sha):
        print('A newer main commit exists; skipping this release.', flush=True)
        return {'skipped': True, 'image': image}
    if image == previous:
        return dict(verify(image), previousImage=previous, unchanged=True)
    name = f'internal-specs-release-{sha[:12]}-{run_id}-{attempt}'
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as handle:
        json.dump(image_parameters(stack['Parameters'], image), handle)
        handle.flush()
        created = aws('cloudformation', 'create-change-set', '--stack-name', STACK,
                      '--change-set-name', name, '--change-set-type', 'UPDATE',
                      '--use-previous-template', '--parameters', f'file://{handle.name}')
    change_id = created['Id']
    aws('cloudformation', 'wait', 'change-set-create-complete', '--change-set-name', change_id)
    change = aws('cloudformation', 'describe-change-set', '--change-set-name', change_id)
    try:
        validate_changes(change)
        if not current_main(sha):
            aws('cloudformation', 'delete-change-set', '--change-set-name', change_id)
            return {'skipped': True, 'image': image}
    except RuntimeError:
        aws('cloudformation', 'delete-change-set', '--change-set-name', change_id)
        raise
    print(json.dumps({'changeSet': change_id, 'previousImage': previous, 'image': image}), flush=True)
    aws('cloudformation', 'execute-change-set', '--change-set-name', change_id, '--no-disable-rollback')
    aws('cloudformation', 'wait', 'stack-update-complete', '--stack-name', STACK)
    aws('ecs', 'wait', 'services-stable', '--cluster', CLUSTER, '--services', SERVICE)
    return dict(verify(image), previousImage=previous, changeSet=change_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-image', help='Read-only verification of an existing image deployment')
    args = parser.parse_args()
    if aws('sts', 'get-caller-identity')['Account'] != ACCOUNT:
        raise RuntimeError('AWS account does not match the deployment account')
    if args.verify_image:
        image_parameters([{'ParameterKey': 'ImageUri'}], args.verify_image)
        print(json.dumps(verify(args.verify_image), indent=2))
        return
    if (os.environ.get('GITHUB_REPOSITORY') != REPOSITORY
            or os.environ.get('GITHUB_REF') != 'refs/heads/main'
            or os.environ.get('GITHUB_EVENT_NAME') != 'push'):
        raise RuntimeError('Automatic releases require a push to this repository main branch')
    sha, run_id, attempt = (os.environ[k] for k in ('GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'))
    if not re.fullmatch(r'[a-f0-9]{40}', sha) or not run_id.isdecimal() or not attempt.isdecimal():
        raise RuntimeError('Invalid GitHub release identifiers')
    if run(['git', 'rev-parse', 'HEAD']).strip() != sha:
        raise RuntimeError('Checked-out commit does not match the checked commit')
    if not current_main(sha):
        print('A newer main commit exists; skipping this release.', flush=True)
        return
    image = publish(sha, run_id, attempt)
    result = deploy_image(image, sha, run_id, attempt)
    print(json.dumps(result, indent=2))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as summary:
            summary.write('## Internal Specs release\n\n```json\n' + json.dumps(result, indent=2) + '\n```\n')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, KeyError, ValueError) as error:
        raise SystemExit(str(error)) from None
