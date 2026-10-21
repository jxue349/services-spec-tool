# Internal Specs Deployment Runbook

Account `012619468172`, region `us-west-2`, hostname
`https://internal-specs.wyze.com`. The approved scope and execution status are in
[the master plan](deployment-master-plan.md).

## Prepare a release

Use Node.js 22, Python 3, AWS CLI, and Docker with `linux/amd64` build support.
Authenticate the local SSO profile `012619468172_AWSAdministratorAccess`.
`tools/deploy.py` verifies the account on every invocation.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build:verify
python3 tools/smoke-production.py --dist .next-verify
python3 tools/deploy.py validate
uvx cfn-lint infra/foundation.yaml infra/service.yaml
```

Production credentials are not required to build the image. Production startup
does require them. The initial application configuration uses Glean, spec-only
answers, JumpCloud, and the repository's `specs/` directory. Development can
explicitly bypass authentication with `DEV_AUTH_BYPASS=true`; production cannot.

## Foundation

The foundation template creates only service-owned resources. It accepts the
existing VPC, subnets, and ACM certificate. Its six default ingress addresses
match the current US VPN and office rules verified on the roadmap service;
revalidate them when preparing a release. `OwnerEmail` defaults to `cxu@wyze.com`.
Override non-secret parameters using a JSON object passed with `--parameters`.

```bash
python3 tools/deploy.py plan foundation
# Inspect every resource change, then use the exact ARN returned above:
python3 tools/deploy.py apply foundation --change-set <reviewed-change-set-arn>
python3 tools/deploy.py status foundation
```

Wait for `CREATE_COMPLETE` or `UPDATE_COMPLETE`. The stack outputs include the
ECR URI, ALB hostname, roles, target group, and runtime secret ARN. The repository,
secret, and log group are retained if the stack is deleted. They are service
resources and require deliberate cleanup separately.

## Provision credentials securely

Populate `/internal-specs/prod/runtime` as one JSON secret. Required keys:

- `GITHUB_TOKEN`: fine-grained service token for the selected spec repository;
  Contents, Pull requests, and Issues read/write permissions.
- `OIDC_CLIENT_SECRET`: the dedicated JumpCloud application's secret.
- `SESSION_SECRET`: at least 32 random bytes, encoded for an environment variable.
- OAuth mode: `GLEAN_CLIENT_ID` and `GLEAN_CLIENT_SECRET`.
- Token mode instead: `GLEAN_API_KEY`.

Use the secure provisioning interface or an existing private file with mode
`0600`. A CLI update can reference the file with `--secret-string file://...`;
never put secret values directly into command arguments, Git, logs, or chat.
Do not deploy using a personal GitHub CLI OAuth token as the service credential.
Global Glean tokens requiring `GLEAN_ACT_AS` need that setting added to the task
configuration before use; OAuth or a suitable user-scoped token is the baseline.

Create the JumpCloud application with callback
`https://internal-specs.wyze.com/api/auth/callback`, approved assignees, and
`openid email profile` scopes. Confirm its issuer and client ID. Assigned users
can read and propose PRs across all teams; there is no per-team user-role model.

ECS reads secrets when tasks start. Rotate credentials in Secrets Manager and
replace tasks to load the new version. Session-secret rotation signs everyone
out; use a coordinated replacement when retiring a compromised signing key.

## Publish the image

Commit the reviewed changes first. The publish command refuses a dirty working
tree, builds for `linux/amd64`, uses the commit SHA as an immutable ECR tag, and
reports the digest and scan severity counts.

```bash
python3 tools/deploy.py publish
```

Review the ECR findings before deployment. An image upload or completed scan is
not evidence that vulnerabilities have been resolved. Record the exact digest
in the release evidence and deploy by digest, not by tag.

The production npm audit on 2026-10-21 reports two low findings in the
Mermaid/KaTeX path and no moderate, high, or critical findings. The full audit
also includes development-tool findings in the Vitest and Tailwind toolchains;
those require a separate compatible toolchain upgrade. The standalone runtime
excludes development tools. CI gates production npm findings at high severity;
the container scan separately covers the final runtime image and OS packages.

## Deploy the service

Prepare a non-secret parameter file outside the repository:

```json
{
  "ImageUri": "012619468172.dkr.ecr.us-west-2.amazonaws.com/internal-specs@sha256:<verified-digest>",
  "OidcIssuer": "https://<actual-jumpcloud-issuer>",
  "OidcClientId": "<actual-client-id>",
  "GleanCredentialMode": "oauth",
  "DesiredCount": 2
}
```

The deployment command imports foundation outputs and checks required secret
keys without displaying their values. Optional `AlarmTopicArn` connects alarms
and ECS deployment-failure events to an existing SNS topic. Its owner must allow
CloudWatch and EventBridge publishing. Without it, metric alarms still exist,
but there are no routed notifications or deployment-event notification rule.

```bash
python3 tools/deploy.py plan service --parameters /secure/path/service-parameters.json
python3 tools/deploy.py apply service --change-set <reviewed-change-set-arn>
python3 tools/deploy.py status service
```

Confirm two healthy targets across the selected AZs, private task ENIs, and
CloudWatch logs. Before DNS exists, test from an allowed network using curl's
`--connect-to` with the real ALB hostname while preserving the intended HTTPS
hostname. Health checks use `/api/healthz`; they make no upstream calls. Requests
have a 120-second total deadline, ALB idle timeout 180 seconds, and Node keepalive
timeout 185 seconds. Validate draining during task replacement, especially for
requests nearing the deadline.

## DNS and acceptance

Add the actual target in a PR to `wyzelabs-inc/wyze-dns-config`:

```js
CNAME("internal-specs", "<actual-alb-dns-name>.", TTL(300), CF_COMMENT("owner: cxu@wyze.com, AI Spec Explorer")),
```

Keep Cloudflare proxy disabled. Follow the repository's preview, code-owner
review, and `dns-production` approval workflow. Do not apply DNS locally.

After DNS resolves, test JumpCloud at the real hostname, denial outside the
company network, unauthorized API rejection, spec reads, and Glean answers.
Exercise write flows against an approved sandbox repository with a separately
scoped token, then restore production repository configuration and verify reads.
Record evidence in the master plan. Do not populate production with smoke-test
issues or specs.

## Rollback and shutdown

For an application rollback, plan and apply the service stack using the previous
image digest and its configuration. Record both task definition revisions.
The ECS circuit breaker can return to a previous successful deployment; no such
revision exists on the first launch. A failed first release can be held at
`DesiredCount=0` while it is corrected.

Revert unintended specification changes through a GitHub PR; infrastructure
rollback does not revert Git history. Remove DNS through its PR workflow and
verify removal before deleting the ALB. Preserve shared network resources, the
cluster, and the certificate. Record and clean up retained service resources
separately when the service is retired.

## Cost baseline

AWS Price List API rates checked on 2026-10-21 for Oregon, Linux x86 Fargate,
using 730 hours/month:

| Resource | Monthly baseline |
| --- | ---: |
| Two tasks totaling 1 vCPU at $0.04048/hour and 2 GiB at $0.004445/GiB-hour | $36.04 |
| One ALB at $0.0225/hour | $16.43 |
| Two public IPv4 addresses at $0.005/address-hour | $7.30 |
| Total before usage charges | $59.77 |

This excludes ALB capacity units, NAT traffic, data transfer, logs, image storage,
secrets, and Glean charges. Additional load balancer IPs can increase the IPv4
line. Existing NAT hourly charges are shared costs. See [Fargate pricing](https://aws.amazon.com/fargate/pricing/)
and [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/).
