#!/usr/bin/env python3
"""Operator-driven CloudFormation deployment with account and credential checks."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = '012619468172'
REGION = 'us-west-2'
PREFIX = 'internal-specs'


def run(command, **kwargs):
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, **kwargs)
    if result.returncode:
        # Commands never contain credential values. Do not print stdout from
        # failed commands: some service APIs return sensitive payloads there.
        raise RuntimeError(result.stderr.strip() or f'{command[0]} failed')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['validate', 'plan', 'apply', 'status', 'publish'])
    parser.add_argument('stack', nargs='?', choices=['foundation', 'service'], default='foundation')
    parser.add_argument('--profile', default=f'{ACCOUNT}_AWSAdministratorAccess')
    parser.add_argument('--parameters', type=Path, help='JSON object of non-secret CloudFormation parameters')
    parser.add_argument('--change-set', help='Exact change set ARN returned by plan')
    args = parser.parse_args()

    def aws(*command):
        raw = run(['aws', *command, '--profile', args.profile, '--region', REGION, '--output', 'json'])
        return json.loads(raw) if raw.strip() else {}

    identity = aws('sts', 'get-caller-identity')
    if identity['Account'] != ACCOUNT:
        raise RuntimeError('Refusing deployment: AWS account does not match the approved account')

    def outputs(stack):
        data = aws('cloudformation', 'describe-stacks', '--stack-name', f'{PREFIX}-{stack}')
        return {item['OutputKey']: item['OutputValue'] for item in data['Stacks'][0].get('Outputs', [])}

    if args.action == 'validate':
        for stack in ('foundation', 'service'):
            aws('cloudformation', 'validate-template', '--template-body', f'file://{ROOT}/infra/{stack}.yaml')
            print(f'{stack}: template validated', flush=True)
        return

    if args.action == 'status':
        data = aws('cloudformation', 'describe-stacks', '--stack-name', f'{PREFIX}-{args.stack}')
        print(json.dumps({'status': data['Stacks'][0]['StackStatus'], 'outputs': outputs(args.stack)}, indent=2))
        if args.stack == 'service':
            state = aws('ecs', 'describe-services', '--cluster', 'wyze-internal', '--services', PREFIX)
            for item in state.get('services', []):
                print(json.dumps({key: item.get(key) for key in ('serviceName', 'desiredCount', 'runningCount', 'deployments', 'events')}, indent=2))
        return

    if args.action == 'publish':
        if run(['git', 'status', '--porcelain']).strip():
            raise RuntimeError('Commit the reviewed changes before publishing an image')
        commit = run(['git', 'rev-parse', 'HEAD']).strip()
        repository = outputs('foundation')['RepositoryUri']
        if repository != f'{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{PREFIX}':
            raise RuntimeError('Unexpected image repository')
        tag = f'{repository}:{commit}'
        print(f'Building {commit} for linux/amd64', flush=True)
        # Publish one runtime image manifest so the tag/digest refers to the
        # image scanned by ECR, rather than a provenance-containing image index.
        subprocess.run(['docker', 'buildx', 'build', '--platform', 'linux/amd64', '--provenance=false', '--load', '-t', tag, '.'], cwd=ROOT, check=True)
        password = run(['aws', 'ecr', 'get-login-password', '--profile', args.profile, '--region', REGION])
        run(['docker', 'login', '--username', 'AWS', '--password-stdin', repository.split('/')[0]], input=password)
        del password
        subprocess.run(['docker', 'push', tag], cwd=ROOT, check=True)
        print('Waiting for ECR scan results', flush=True)
        aws('ecr', 'wait', 'image-scan-complete', '--repository-name', PREFIX, '--image-id', f'imageTag={commit}')
        scan = aws('ecr', 'describe-image-scan-findings', '--repository-name', PREFIX, '--image-id', f'imageTag={commit}')
        print(json.dumps({'image': f"{repository}@{scan['imageId']['imageDigest']}", 'scan': scan.get('imageScanStatus'), 'findings': scan.get('imageScanFindings', {}).get('findingSeverityCounts', {})}, indent=2))
        return

    stack_name = f'{PREFIX}-{args.stack}'
    if args.action == 'apply':
        if not args.change_set:
            raise RuntimeError('apply requires the exact reviewed --change-set ARN')
        change = aws('cloudformation', 'describe-change-set', '--change-set-name', args.change_set)
        if change['StackName'] != stack_name or change['ExecutionStatus'] != 'AVAILABLE':
            raise RuntimeError('Change set is not available for the requested stack')
        aws('cloudformation', 'execute-change-set', '--change-set-name', args.change_set)
        print(f'{stack_name}: execution started; use status to follow completion', flush=True)
        return

    supplied = json.loads(args.parameters.read_text()) if args.parameters else {}
    forbidden = {'GITHUB_TOKEN', 'SESSION_SECRET', 'OIDC_CLIENT_SECRET', 'GLEAN_API_KEY', 'GLEAN_CLIENT_SECRET'}
    if forbidden.intersection(supplied):
        raise RuntimeError('Secret values do not belong in CloudFormation parameters')
    if args.stack == 'service':
        existing = outputs('foundation')
        for key in ('RuntimeSecretArn', 'ExecutionRoleArn', 'TaskRoleArn', 'TaskSecurityGroupId', 'TargetGroupArn', 'TargetGroupFullName', 'AlbFullName'):
            supplied[key] = existing[key]
        for key in ('ImageUri', 'OidcIssuer', 'OidcClientId'):
            if not supplied.get(key):
                raise RuntimeError(f'{key} is required')
        # Validate keys without printing, persisting, or passing values as CLI arguments.
        try:
            payload = aws('secretsmanager', 'get-secret-value', '--secret-id', existing['RuntimeSecretArn'])
            values = json.loads(payload.get('SecretString', '{}'))
        except (RuntimeError, ValueError):
            raise RuntimeError('Populate the runtime secret securely before planning the service') from None
        required = ['GITHUB_TOKEN', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET']
        required += ['GLEAN_CLIENT_ID', 'GLEAN_CLIENT_SECRET'] if supplied.get('GleanCredentialMode', 'oauth') == 'oauth' else ['GLEAN_API_KEY']
        missing = [key for key in required if not isinstance(values.get(key), str) or not values[key].strip()]
        if missing:
            raise RuntimeError('Runtime secret is missing keys: ' + ', '.join(missing))
        if len(values['SESSION_SECRET']) < 32:
            raise RuntimeError('Runtime session secret is too short')
        del values, payload

    try:
        existing_stack = aws('cloudformation', 'describe-stacks', '--stack-name', stack_name)['Stacks'][0]
        kind = 'CREATE' if existing_stack['StackStatus'] == 'REVIEW_IN_PROGRESS' else 'UPDATE'
    except RuntimeError as error:
        if 'does not exist' not in str(error):
            raise
        kind = 'CREATE'
    name = f'review-{int(time.time())}'
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as parameter_file:
        json.dump([{'ParameterKey': key, 'ParameterValue': str(value)} for key, value in supplied.items()], parameter_file)
        parameter_file.flush()
        command = ['cloudformation', 'create-change-set', '--stack-name', stack_name, '--change-set-name', name, '--change-set-type', kind, '--template-body', f'file://{ROOT}/infra/{args.stack}.yaml', '--capabilities', 'CAPABILITY_IAM', '--parameters', f'file://{parameter_file.name}']
        created = aws(*command)
    print(json.dumps(created), flush=True)
    aws('cloudformation', 'wait', 'change-set-create-complete', '--change-set-name', created['Id'])
    change = aws('cloudformation', 'describe-change-set', '--change-set-name', created['Id'])
    print(json.dumps({'changeSet': created['Id'], 'status': change['Status'], 'changes': [item['ResourceChange'] for item in change['Changes']]}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
