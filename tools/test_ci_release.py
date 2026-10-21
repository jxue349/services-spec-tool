"""Release boundaries: preserve runtime settings, gate scans, detect rollback."""
import copy
import os
import unittest
from unittest.mock import patch

import ci_release as release

IMAGE = release.ECR + '@sha256:' + 'a' * 64


def change_set():
    return {'Status': 'CREATE_COMPLETE', 'ExecutionStatus': 'AVAILABLE', 'Changes': [
        {'ResourceChange': {'LogicalResourceId': name, 'Action': 'Modify',
                            'ResourceType': kind, 'Replacement': replacement,
                            'Scope': ['Properties'], 'Details': [
                                {'Target': {'Attribute': 'Properties', 'Name': prop}}]}}
        for name, kind, replacement, prop in [
            ('TaskDefinition', 'AWS::ECS::TaskDefinition', 'True', 'ContainerDefinitions'),
            ('Service', 'AWS::ECS::Service', 'False', 'TaskDefinition'),
        ]
    ]}


class ReleaseBoundaryTests(unittest.TestCase):
    def test_changes_only_image_and_preserves_all_current_parameters(self):
        parameters = [{'ParameterKey': k, 'ParameterValue': v} for k, v in {
            'ImageUri': 'old', 'AuthMode': 'test-readonly', 'DesiredCount': '2',
            'GleanCredentialMode': 'auto', 'RuntimeSecretArn': 'secret-reference',
            'OidcIssuer': '', 'FutureSetting': 'preserve-me',
        }.items()]
        result = {p['ParameterKey']: p for p in release.image_parameters(parameters, IMAGE)}
        self.assertEqual(result['ImageUri']['ParameterValue'], IMAGE)
        for key in result.keys() - {'ImageUri'}:
            self.assertEqual(result[key], {'ParameterKey': key, 'UsePreviousValue': True})

    def test_rejects_mutable_tags_and_other_repositories(self):
        for image in [release.ECR + ':latest', IMAGE.replace('internal-specs', 'other'),
                      IMAGE.replace(release.ACCOUNT, '111111111111')]:
            with self.subTest(image=image), self.assertRaises(RuntimeError):
                release.image_parameters([{'ParameterKey': 'ImageUri'}], image)

    def test_accepts_only_the_expected_image_release_changes(self):
        release.validate_changes(change_set())
        mutations = [
            lambda c: c['Changes'].append({'ResourceChange': {'LogicalResourceId': 'CpuAlarm'}}),
            lambda c: c['Changes'][1]['ResourceChange'].update(Replacement='True'),
            lambda c: c['Changes'][0]['ResourceChange'].update(Action='Remove'),
            lambda c: c['Changes'][1]['ResourceChange']['Details'][0]['Target'].update(Name='DesiredCount'),
            lambda c: c.update(ExecutionStatus='EXECUTE_COMPLETE'),
        ]
        for mutate in mutations:
            change = change_set()
            mutate(change)
            with self.assertRaises(RuntimeError):
                release.validate_changes(change)

    def test_scan_must_complete_without_high_or_critical_findings(self):
        clean = {'imageScanStatus': {'status': 'COMPLETE'},
                 'imageScanFindings': {'findingSeverityCounts': {'LOW': 2}}}
        release.require_clean_scan(clean)
        for severity in ('HIGH', 'CRITICAL'):
            scan = copy.deepcopy(clean)
            scan['imageScanFindings']['findingSeverityCounts'][severity] = 1
            with self.assertRaises(RuntimeError):
                release.require_clean_scan(scan)
        for status in ('IN_PROGRESS', 'FAILED', 'UNSUPPORTED_IMAGE'):
            with self.assertRaises(RuntimeError):
                release.require_clean_scan(dict(clean, imageScanStatus={'status': status}))
        with self.assertRaises(RuntimeError):
            release.require_clean_scan({'imageScanStatus': {'status': 'COMPLETE'}})

    @patch('ci_release.current_main', return_value=False)
    @patch('ci_release.aws')
    def test_stale_release_never_creates_or_executes_a_change_set(self, aws, _current):
        aws.return_value = {'Stacks': [{'StackStatus': 'UPDATE_COMPLETE', 'Parameters': [
            {'ParameterKey': 'ImageUri', 'ParameterValue': 'old'}]}]}
        self.assertTrue(release.deploy_image(IMAGE, 'a' * 40, '1', '1')['skipped'])
        aws.assert_called_once_with('cloudformation', 'describe-stacks', '--stack-name', release.STACK)

    @patch('ci_release.publish')
    @patch('ci_release.aws', return_value={'Account': release.ACCOUNT})
    @patch('sys.argv', ['ci_release.py'])
    def test_pr_and_feature_branch_cannot_publish(self, _aws, publish):
        for event, ref in [('pull_request', 'refs/pull/1/merge'), ('push', 'refs/heads/feature')]:
            with patch.dict(os.environ, {'GITHUB_REPOSITORY': release.REPOSITORY,
                                         'GITHUB_EVENT_NAME': event, 'GITHUB_REF': ref}, clear=True):
                with self.assertRaises(RuntimeError):
                    release.main()
        publish.assert_not_called()

    @patch('ci_release.aws')
    def test_stable_rollback_is_a_failed_release(self, aws):
        aws.side_effect = [
            {'services': [{'desiredCount': 2, 'runningCount': 2, 'pendingCount': 0,
                           'deployments': [{'rolloutState': 'COMPLETED'}], 'taskDefinition': 'old'}]},
            {'taskDefinition': {'containerDefinitions': [{'name': 'web', 'image': 'old-image'}]}},
        ]
        with self.assertRaisesRegex(RuntimeError, 'different image'):
            release.verify(IMAGE)


if __name__ == '__main__':
    unittest.main()
