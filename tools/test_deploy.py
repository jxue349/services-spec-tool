"""Deployment preflight must distinguish empty test fields from launch credentials."""
import unittest
from deploy import validate_service_secret


class SecretPreflightTests(unittest.TestCase):
    def setUp(self):
        self.values = dict.fromkeys(['GITHUB_TOKEN', 'OIDC_CLIENT_SECRET', 'GLEAN_ACT_AS', 'GLEAN_TOKEN', 'GLEAN_CLIENT_ID', 'GLEAN_CLIENT_SECRET'], '')
        self.values['SESSION_SECRET'] = 'test-only-' * 8

    def test_empty_integrations_only_allowed_for_explicit_test_mode(self):
        validate_service_secret(self.values, 'test-readonly', 'auto')
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'oidc', 'auto')
        del self.values['GLEAN_TOKEN']
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'test-readonly', 'auto')

    def test_session_key_required_and_auth_modes_fail_closed(self):
        self.values['SESSION_SECRET'] = 'short'
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'test-readonly', 'auto')
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'off', 'auto')

    def test_one_complete_glean_credential_type(self):
        self.values.update(GITHUB_TOKEN='test-only', OIDC_CLIENT_SECRET='test-only', GLEAN_TOKEN='test-only')
        validate_service_secret(self.values, 'oidc', 'auto')
        self.values['GLEAN_CLIENT_ID'] = 'test-only'
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'test-readonly', 'auto')
        self.values['GLEAN_CLIENT_SECRET'] = 'test-only'
        with self.assertRaises(RuntimeError):
            validate_service_secret(self.values, 'test-readonly', 'auto')
        self.values['GLEAN_TOKEN'] = ''
        validate_service_secret(self.values, 'oidc', 'auto')


if __name__ == '__main__':
    unittest.main()
