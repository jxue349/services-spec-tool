#!/usr/bin/env python3
"""Check the built standalone server without real credentials or upstream calls."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', default='.next')
    args = parser.parse_args()
    server = ROOT / args.dist / 'standalone/server.js'
    if not server.is_file():
        raise RuntimeError('Build the standalone server first')

    def launch(extra):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = {'PATH': os.environ['PATH'], 'NODE_ENV': 'production', 'PORT': str(port), 'HOSTNAME': '127.0.0.1', **extra}
        proc = subprocess.Popen(['node', str(server)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        return proc, port

    def stop(proc):
        proc.terminate()
        try:
            proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()

    for invalid in ({}, {'DEV_AUTH_BYPASS': 'true'}):
        proc, _ = launch(invalid)
        try:
            output, _ = proc.communicate(timeout=10)
            assert proc.returncode != 0, 'Invalid production configuration must prevent startup'
            assert 'Production startup configuration is invalid' in output, 'Unexpected startup failure'
        finally:
            if proc.poll() is None:
                stop(proc)
    print('Missing credentials and production auth bypass: startup rejected')

    # Deliberately fake values satisfy structural configuration checks. These
    # checks never log in or invoke GitHub, Glean, or any external provider.
    settings = {
        'APP_BASE_URL': 'https://internal-specs.wyze.com',
        'OIDC_ISSUER': 'https://identity.invalid',
        'OIDC_CLIENT_ID': 'local-test', 'OIDC_CLIENT_SECRET': 'local-test',
        'SESSION_SECRET': 'a' * 48, 'OIDC_ALLOWED_EMAIL_DOMAINS': 'wyze.com',
        'GITHUB_TOKEN': 'local-test', 'GITHUB_OWNER': 'local-test', 'GITHUB_REPO': 'local-test',
        'COMPILER_PROVIDER': 'glean', 'GLEAN_API_KEY': 'local-test', 'GLEAN_INSTANCE': 'wyze',
        'ALLOW_DIRECT_COMMIT': 'false',
    }
    proc, port = launch(settings)
    base = f'http://127.0.0.1:{port}'
    try:
        for _ in range(80):
            try:
                with urllib.request.urlopen(base + '/api/healthz', timeout=1) as response:
                    assert response.status == 200
                break
            except (urllib.error.URLError, TimeoutError):
                if proc.poll() is not None:
                    raise RuntimeError('Configured server exited')
                time.sleep(0.1)
        else:
            raise RuntimeError('Health never became ready')
        for path, method in [('/api/spec', 'GET'), ('/api/teams', 'GET'), ('/api/ask', 'POST'), ('/api/spec/init', 'POST')]:
            try:
                urllib.request.urlopen(urllib.request.Request(base + path, method=method), timeout=2)
                raise RuntimeError(f'{path} unexpectedly allowed access')
            except urllib.error.HTTPError as error:
                assert error.code == 401, (path, error.code)
        with urllib.request.urlopen(base + '/', timeout=3) as response:
            assert 'Sign in with your company account' in response.read().decode()
        print('Health 200; sign-in screen visible; protected read/model/write APIs 401')
    finally:
        stop(proc)


if __name__ == '__main__':
    main()
