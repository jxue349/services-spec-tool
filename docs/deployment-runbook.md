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

Production credentials are not required to build the image. Normal OIDC startup
does require them. The initial application configuration uses Glean, spec-only
answers, JumpCloud, and the repository's `specs/` directory. Development can
explicitly bypass authentication with `DEV_AUTH_BYPASS=true`; production cannot.
The separately authorized temporary mode is described below.

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
secret, KMS key, log group, and access-log bucket are retained if the stack is
deleted. They require deliberate cleanup separately. The KMS key rotates annually
and protects the runtime secret, application logs, and image repository.

The private access-log bucket expires objects after 30 days. It uses SSE-S3,
the encryption mode supported by [ALB log delivery](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html).
Its delivery policy is restricted to this account and region. Non-service
principals must use TLS; the AWS service exception follows
[S3 guidance for service-to-service requests](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html).
Restrict operator access: ALB request URLs can contain OIDC callback codes and
state values. Application log redaction does not redact ALB URLs.

## Provision credentials securely

Populate `/internal-specs/prod/runtime` as one JSON secret. Required keys:

- `GITHUB_TOKEN`: fine-grained service token for the selected spec repository;
  Contents, Pull requests, and Issues read/write permissions.
- `OIDC_CLIENT_SECRET`: the dedicated JumpCloud application's secret.
- `SESSION_SECRET`: at least 32 random bytes, encoded for an environment variable.
- OAuth mode: `GLEAN_CLIENT_ID` and `GLEAN_CLIENT_SECRET`.
- Token mode instead: `GLEAN_TOKEN`. ECS injects this secret field into the
  application's existing `GLEAN_API_KEY` environment variable.
- `GLEAN_ACT_AS`: leave empty unless a global Glean token requires a service-user email.

All seven required fields exist; `SESSION_SECRET` was generated securely, and
the owner supplied `GITHUB_TOKEN` and `GLEAN_TOKEN`. Preserve the session key.
The older empty `GLEAN_API_KEY` secret field is unused by the current template.
In the default `GleanCredentialMode=auto`, ECS injects both Glean credential
options, and the application requires exactly one populated option. Fill either
the OAuth pair or the API token, leaving the other fields empty. Empty fields
are intentional placeholders, never dummy credentials sent to providers.

Use the secure provisioning interface or an existing private file with mode
`0600`. A CLI update can reference the file with `--secret-string file://...`;
never put secret values directly into command arguments, Git, logs, or chat.
Do not deploy using a personal GitHub CLI OAuth token as the service credential.
The task reads `GLEAN_ACT_AS` from this same secret when required.

Create the JumpCloud application with callback
`https://internal-specs.wyze.com/api/auth/callback`, approved assignees, and
`openid email profile` scopes. Confirm its issuer and client ID. Assigned users
can read and propose PRs across all teams; there is no per-team user-role model.

ECS reads secrets when tasks start. Rotate credentials in Secrets Manager and
replace tasks to load the new version. Session-secret rotation signs everyone
out; use a coordinated replacement when retiring a compromised signing key.

## Temporary testing without SSO

The user authorized disabling SSO temporarily on 2026-10-21. Deploy with
`AuthMode=test-readonly` and `GleanCredentialMode=auto`. Omit the OIDC issuer and
client ID for this phase. The existing VPN/office source allowlist remains the
network boundary. There is no authenticated user identity in this mode, even
if a browser still has an old session cookie.

The workspace, spec reads, Ask, and compile calls are available once their
provider credentials are filled in. All repository mutations, including PRs,
issues, uploads and initialization, return 403 before parsing request bodies.
New protected routes are denied in this mode unless explicitly marked read-only.
Same-origin checks still apply to POST requests; callers share a per-task rate
limit. Missing integration credentials do not prevent startup, and the UI
shows which integrations await configuration. Health 200 only proves the web
server is running, not that GitHub or Glean works.

After securely updating the runtime secret, replace tasks to load the new values:

```bash
aws ecs update-service --cluster wyze-internal --service internal-specs \
  --force-new-deployment --profile 012619468172_AWSAdministratorAccess \
  --region us-west-2 --query 'service.{name:serviceName,desired:desiredCount}'
```

To end the test phase, populate `OIDC_CLIENT_SECRET`, supply the issuer/client ID,
set `AuthMode=oidc`, and plan/apply the service update. Confirm anonymous requests
return 401 and validate JumpCloud sign-in before accepting authenticated writes.
The deployment tool refuses normal OIDC mode while required secrets are empty.

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
the [ECR basic scan](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-basic.html)
separately covers OS packages in the final runtime image. JavaScript dependency
findings come from npm audit. The runtime installs Alpine's patched
`zlib>=1.3.2-r1` for CVE-2026-85091; the upstream Node base image initially carried
the affected `1.3.2-r0` package.

## Deploy the service

Prepare a non-secret parameter file outside the repository:

```json
{
  "ImageUri": "012619468172.dkr.ecr.us-west-2.amazonaws.com/internal-specs@sha256:<verified-digest>",
  "AuthMode": "oidc",
  "OidcIssuer": "https://<actual-jumpcloud-issuer>",
  "OidcClientId": "<actual-client-id>",
  "GleanCredentialMode": "auto",
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
verify removal before deleting the ALB. Deliberately update the foundation's
`DeletionProtection` parameter to `false` before stack retirement. Preserve shared network resources, the
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
| One customer-managed KMS key, before rotations | $1.00 |
| Total before usage charges | $60.77 |

This excludes ALB capacity units, NAT traffic, data transfer, logs, image storage,
secrets, KMS requests, access-log storage, and Glean charges. Additional load balancer IPs can increase the IPv4
line. Existing NAT hourly charges are shared costs. See [Fargate pricing](https://aws.amazon.com/fargate/pricing/)
and [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/). The first
two KMS rotations each add $1/month under [KMS pricing](https://aws.amazon.com/kms/pricing/).

## Infrastructure scanner findings

The initial PR scan identified missing KMS configuration, deletion protection,
ALB access logging, and security-rule descriptions. The foundation now includes
those controls. Initial Wiz output also reports medium/low informational findings
without per-rule details through the GitHub API; its linked report remains part
of release review. Recheck scanner results for each revised commit.

The following configuration is intentional and remains visible to reviewers:

- An internet-facing ALB is required because this VPC uses public company VPN
  egress addresses; its security group permits only six verified `/32` sources
  on 443. Private tasks cannot accept traffic directly from the internet.
- Task outbound 443 allows GitHub, Glean, JumpCloud, and AWS endpoints with
  changing addresses through existing NAT. A firewall or egress proxy would be
  required for domain-level restrictions and is outside this release.
- Logs retain 30 days, matching the approved baseline. A scanner recommendation
  of one year is not the configured retention policy.
- The ALB log bucket uses SSE-S3 as required by AWS log delivery; other persistent
  service resources use the rotating customer-managed KMS key.
- The operational log bucket has no cross-region replication or separate bucket
  access-log destination. The application has no dependency on these logs for
  persistence or recovery; its source of truth is GitHub.
