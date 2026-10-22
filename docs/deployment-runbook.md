# Internal Specs Deployment Runbook

Account `012619468172`, region `us-west-2`, hostname
`https://internal-specs.wyze.com`. The approved scope and execution status are in
[the master plan](deployment-master-plan.md#current-deployment-snapshot).
See [architecture.md](../architecture.md) for the current AWS resource inventory,
network/authentication design, and known operational limits.

## Automatic releases from main

The [Checks workflow](../.github/workflows/checks.yml) validates pull requests and
pushes to `main`. Every successful `main` push also runs **Deploy main to ECS**.
Pull requests and other branches never deploy. There is no development/preview
environment; even docs/spec-only main merges trigger a production image release. The protected branch requires a
PR, up-to-date checks, and resolved conversations, with zero required reviewer
approvals and no bypass actors. See the [development workflow](development-workflow.md)
for contributor commands and the administrative policy files.

1. Application checks must pass: lint, typecheck, Vitest, production build/smoke,
   production/full dependency audits, and PR dependency review when applicable. Infrastructure checks validate all four
   CloudFormation templates, lint the workflow, and run deployment-tool tests.
   The required **PR gate** explicitly fails unless both jobs succeed; the
   deployment job depends on that gate.
2. GitHub OIDC assumes `arn:aws:iam::012619468172:role/internal-specs-github-deploy`.
   No AWS access keys or application credentials are stored in GitHub.
3. Build `linux/amd64` from the checked commit and push to the `internal-specs`
   ECR repository. The immutable tag is `<commit-sha>-<run-id>-<attempt>`; the
   running service always references the resulting SHA-256 digest.
4. Require a completed ECR scan with no high or critical findings. An incomplete
   or failed scan stops deployment; the existing service continues running.
5. Create and validate a CloudFormation change set using the **currently deployed
   template**, replacing only `ImageUri`. Preserve every other stack parameter,
   including `AuthMode`, OIDC settings, secret references, network IDs and capacity.
6. Wait for CloudFormation and ECS completion, then verify the intended digest,
   healthy tasks, AZ distribution, and healthy ALB targets. A circuit-breaker
   rollback to an older image makes the workflow fail even if ECS becomes stable.

Releases are serialized; an active deployment is not cancelled by a newer push.
The job checks the current `main` SHA before building and again before applying,
so a stale queued run cannot deploy over a newer release. A new push after
execution starts waits for the active rollout to finish. Successful release
summaries include the new/previous image, task definition, and change-set ARN.
Re-running the current `main` workflow uses a new immutable image tag.

GitHub-hosted runners are outside the service's VPN/office allowlist. CI verifies
health through AWS APIs; browser and provider acceptance checks run from an
approved network. The workflow does not broaden network access. Production
uses `AuthMode=oidc` after the 2026-10-22 operator cutover; image releases preserve
that setting. Assigned-user login, authenticated reads, local sign-out, and
repeat sign-in pass; see [the current SSO verification](cognito-sso.md#cutover-and-login-verification).

Infrastructure/template changes and SSO setup still use the operator plan/apply
procedure below. Merging a template change alone does not apply it to production.
Pause automatic releases by disabling the Checks workflow or removing the
deployment role's trust; retain the previous image digest for operator rollback.

### Bootstrap CI access

The [CI template](../infra/ci.yaml) creates one dedicated IAM role and references
the account's existing GitHub OIDC provider. Its trust is restricted to this
repository's immutable identity and `refs/heads/main`, as verified through
`repos/wyzelabs-inc/KB-Spec-explorer/actions/oidc/customization/sub`.
The workflow deliberately has no GitHub environment because that would change
the OIDC subject; review trust conditions before adding one.

The role can publish/scan this ECR repository, manage release change sets for
`internal-specs-service`, update this ECS service, and pass only its existing
task/execution roles. It cannot read Secrets Manager values or modify the
foundation, Cognito, IAM roles, DNS, or networking. Registration/inspection APIs that lack
resource-level scoping have the minimum required wildcard permissions.
CloudFormation's existing-subnet parameter validation has read-only
`ec2:DescribeSubnets` permission restricted to `us-west-2`.
Task-definition cleanup also requires `Resource: '*'` because
[`ecs:DeregisterTaskDefinition` has no resource-level scope](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ecs.html).
That grant requires `aws:RequestedRegion=us-west-2` and
`aws:CalledViaLast=cloudformation.amazonaws.com`; direct deregistration by the
CI role is denied. CloudFormation management remains limited to this service stack.

Provision or update this role using the administrator profile:

```bash
python3 tools/deploy.py plan ci
python3 tools/deploy.py apply ci --change-set <reviewed-change-set-arn>
python3 tools/deploy.py status ci
```

This bootstrap is separate from application releases. PR #1 merged the workflow
into `main`; verify each automatic rollout in its GitHub Actions run and release
summary rather than inferring deployment from the merge.

## Prepare an operator release

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
uvx --from cfn-lint==1.58.0 cfn-lint infra/foundation.yaml infra/service.yaml infra/ci.yaml infra/cognito.yaml
python3 -m unittest discover -s tools -p 'test_*.py'
```

Production credentials are not required to build the image. Normal OIDC startup
does require them. The current application configuration uses Glean, spec-only
answers, Cognito/JumpCloud, and the repository's `specs/` directory. Development can
explicitly bypass authentication with `DEV_AUTH_BYPASS=true`; production cannot.
The separately authorized temporary mode is described below.

## Cognito and JumpCloud SSO

The separate `internal-specs-cognito` stack provisions the dedicated user pool,
app client, and Hosted UI domain needed for IT's JumpCloud SAML setup. It does
not enable application authentication. Use `tools/deploy.py plan cognito`,
inspect the change set, and apply its exact ARN with `apply cognito`.
See [Cognito setup and IT values](cognito-sso.md) for the provisioned identifiers,
federation, verification, and rollback. The separate service cutover enabled
OIDC on 2026-10-22. Anonymous protected APIs return 401. Cognito maps the actual
JumpCloud claims `email` and `name`, matching the existing `wyze-kb-users` pool;
assigned-user callback and authenticated spec loading pass. After claim-mapping
changes, clear the prior Cognito login session before retesting.

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
  Contents read-only for temporary testing. Full authenticated operation needs
  Contents, Pull requests, and Issues read/write permissions.
- `OIDC_CLIENT_SECRET`: the dedicated Cognito app client's generated secret.
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

Configure the dedicated JumpCloud SAML application with Cognito's SP Entity ID
and ACS URL from [the SSO setup](cognito-sso.md). Register
`https://internal-specs.wyze.com/api/auth/callback` on the Cognito OIDC client
with `openid email profile` scopes. Use Cognito's issuer, client ID, and secret
in the application. Assigned users can read and propose PRs across all teams;
there is no per-team user-role model.

ECS reads secrets when tasks start. Rotate credentials in Secrets Manager and
replace tasks to load the new version. Session-secret rotation signs everyone
out; use a coordinated replacement when retiring a compromised signing key.

## Temporary testing without SSO

This historical phase ended with the 2026-10-22 OIDC cutover. Re-entering it
requires deliberate approval because it allows anonymous reads/model calls
inside the network boundary.

The user authorized disabling SSO temporarily on 2026-10-21. That phase used
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

## Publish an operator image

Normal image releases run automatically after a checked main merge. Use this
manual path only for a reviewed operator release; do not overlap the CI rollout.

Commit the reviewed changes first. The publish command refuses a dirty working
tree, builds for `linux/amd64`, uses the commit SHA as an immutable ECR tag, and
reports the digest and scan severity counts.

```bash
python3 tools/deploy.py publish
```

Review the ECR findings before deployment. An image upload or completed scan is
not evidence that vulnerabilities have been resolved. Record the exact digest
in the release evidence and deploy by digest, not by tag.

The 2026-10-22 remediation removed the earlier production npm findings; the
production audit reports zero vulnerabilities. The full audit passes the
critical threshold but retains a development-only `braces` advisory; see
[security remediation](security-remediation.md) for details. Re-run audits for
every candidate. CI gates production findings at high severity, all dependencies
at critical severity, and newly introduced PR dependencies at high severity;
the [ECR basic scan](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-basic.html)
separately covers OS packages in the final runtime image. JavaScript dependency
findings come from npm audit. The runtime installs Alpine's patched
`zlib>=1.3.2-r1` for CVE-2026-85091; the upstream Node base image initially carried
the affected `1.3.2-r0` package.

## Deploy the service

For an existing service, first snapshot **all current parameters** and the image
digest. `tools/deploy.py plan service` uses template/tool defaults for omitted
parameters; unlike automated image releases, it does not preserve every live
value automatically. Review the complete before/after parameter diff, especially
OIDC, secret references, network IDs, capacity, and alarm routing. Apply only the
intended changes and avoid any concurrent CI update.

The following is an illustrative subset, **not a complete update file**. Prepare
the full non-secret parameter file outside the repository from the live values:

```json
{
  "ImageUri": "012619468172.dkr.ecr.us-west-2.amazonaws.com/internal-specs@sha256:<verified-digest>",
  "AuthMode": "oidc",
  "OidcIssuer": "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_Q18L1whbh",
  "OidcClientId": "35vi4dlcdhefcc8pvq56jp8nh3",
  "GleanCredentialMode": "auto",
  "DesiredCount": 2
}
```

The deployment command imports foundation outputs and checks required secret
keys without displaying their values. Optional `AlarmTopicArn` connects alarms
and ECS deployment-failure events to an existing SNS topic. Its owner must allow
CloudWatch and EventBridge publishing. Without it, metric alarms still exist,
but there are no routed notifications or deployment-event notification rule.
As verified on 2026-10-22, production has an empty `AlarmTopicArn`.

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

The DNS-only CNAME already exists from DNS PR #49. Future target changes must
use a PR in `wyzelabs-inc/wyze-dns-config`, preserving the existing ownership
metadata and that repository's review requirements:

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

For an automatic-release failure, inspect the Actions job and CloudFormation
events before retrying. Do not start a competing operator update while the stack
is updating or rolling back. The release summary/log records `previousImage`.
An operator can also validate an existing deployment without changing it:

```bash
AWS_PROFILE=012619468172_AWSAdministratorAccess python3 tools/ci_release.py \
  --verify-image '012619468172.dkr.ecr.us-west-2.amazonaws.com/internal-specs@sha256:<digest>'
```

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
