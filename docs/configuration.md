# Configuration and Integrations

Copy `.env.example` to `.env` for local development. It contains server settings;
never commit the filled file or introduce `NEXT_PUBLIC_*` credentials. Production
uses ECS environment settings and Secrets Manager, not a checked-in `.env`.
See [architecture](../architecture.md) for the deployed resources and boundaries.

## GitHub and specifications

| Variable | Repository example / behavior |
| --- | --- |
| `GITHUB_OWNER`, `GITHUB_REPO` | `wyzelabs-inc`, `KB-Spec-explorer`; use an approved sandbox for write tests. |
| `GITHUB_TOKEN` | Server-side fine-grained PAT scoped to the selected repository. |
| `SPEC_ROOT` | `specs`; confines spec paths. The code fallback is `spec`, so set this explicitly. |
| `SPEC_PARENT_PATH` | `specs/services/parent.md`; fallback for files outside the team layout. |
| `SPEC_DEFAULT_TEAM` | `services`; otherwise the first discovered team is selected. |
| `SPEC_BASE_BRANCH` | `main`; persistent source of truth. |
| `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` | `AI Spec Explorer`, `spec-explorer@wyze.com`; commit identity defaults. |
| `ALLOW_DIRECT_COMMIT` | `false`; production rejects `true`. |

For all features, grant the token **Contents: read/write**, **Pull requests:
read/write**, and **Issues: read/write** on this repository. GitHub supplies
metadata read access. Do not grant organization administration or workflow
permissions. Organization approval may be required. A read-only token can load
specs but cannot save changes or file reports. The service uses this token for
all callers; signing in does not authorize through each user's GitHub account.

A child resolves to its own team's `parent.md`. For legacy flat layouts,
`SPEC_PARENT_PATH` falls back to `SPEC_PATH`, then `${SPEC_ROOT}/parent.md`.
See [multi-team organization](multi-team.md) before changing paths or rule IDs.

## Glean compiler

Production uses `COMPILER_PROVIDER=glean`, `GLEAN_INSTANCE=wyze`,
`GLEAN_AGENT=GPT`, `GLEAN_MODE=DEFAULT`, and `GLEAN_COMPANY_KNOWLEDGE=false`.
`GLEAN_BASE_URL`, if set, overrides the instance-derived backend origin.

Configure exactly one credential method, with the unused fields empty:

- **Platform token:** set `GLEAN_API_KEY` locally. Obtain a token with Chat API
  access from the Glean administrator. If it is a global token, set
  `GLEAN_ACT_AS` to the approved service-user email when required by the tenant.
- **OAuth client credentials:** set `GLEAN_CLIENT_ID` and `GLEAN_CLIENT_SECRET`,
  with `GLEAN_SCOPE=chat`. This implementation posts to the backend's
  `/oauth/token` using `client_credentials` and `client_secret_basic`, caches
  short-lived tokens, and refreshes once after a 401. Confirm that the Glean
  administrator issued a compatible client; an arbitrary OAuth client is not
  sufficient. Rotating ECS-injected values requires replacing tasks.

`GPT` is the application's spec-only compiler mode. Do not substitute a retrieval
agent without revisiting the spec-grounding contract and tests. Provider/agent
availability must be validated with the tenant when changing integrations.

Optional `GLEAN_COMPANY_KNOWLEDGE=true` adds a separate Ask answer panel backed
by `GLEAN_COMPANY_KNOWLEDGE_AGENT` (default `DEFAULT`, cannot be `GPT`). It uses
Glean's indexed content and the configured service credential/act-as identity,
not the signed-in employee's delegated Glean identity. Review that identity's
content access before enabling the panel. The app needs no additional direct
Jira, Confluence, or Slack tokens.

### Local Glean stand-in

Set the following in local `.env`, leaving the OAuth fields empty:

```dotenv
COMPILER_PROVIDER=glean
GLEAN_BASE_URL=http://127.0.0.1:3399
GLEAN_API_KEY=local-stub-token
GLEAN_AGENT=GPT
GLEAN_COMPANY_KNOWLEDGE=false
```

Run `npm run stub:glean`, then `DEV_AUTH_BYPASS=true npm run dev` in a second
terminal. The stub returns synthetic responses; GitHub still requires a token.
This HTTP provider and authentication bypass are for development, not production.

## Optional Bedrock compiler

Set `COMPILER_PROVIDER=bedrock`, a verified Converse-compatible
`BEDROCK_MODEL_ID` or inference-profile ID, and `AWS_REGION` (fallback
`AWS_DEFAULT_REGION`, then `us-west-2`). `BEDROCK_TEMPERATURE` defaults to `0`
and accepts values from `0` to `1`; zero does not guarantee identical output.
Use the AWS SDK credential chain, such as local SSO or an ECS task role, rather
than committing keys. Verify model availability, access, and scoped permissions
in the target account/region before changing providers.

The production service template currently configures Glean, and its task role
has no Bedrock permission. A production switch requires reviewed infrastructure
and configuration work; changing a local `.env` does not enable it in ECS.

## Authentication

| Variable | Production setting / purpose |
| --- | --- |
| `AUTH_MODE` | `oidc`; normal authenticated operation. |
| `DEV_AUTH_BYPASS` | `false`; only local development may use `true`. |
| `APP_BASE_URL` | `https://internal-specs.wyze.com`; canonical public origin for callback/origin validation. |
| `OIDC_ISSUER` | Cognito issuer from [the SSO guide](cognito-sso.md), not the JumpCloud metadata URL. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Dedicated Cognito confidential app client. |
| `OIDC_ALLOWED_EMAIL_DOMAINS` | `wyze.com`. |
| `SESSION_SECRET` | Shared signing secret across replicas; generate at least 32 random bytes and store securely. |

Production startup fails on invalid auth/integration configuration. Local
`npm start` and the production Docker image enforce those same checks; the
README's development bypass is not a production-container recipe.
`AUTH_MODE=test-readonly` exists for explicitly authorized network-restricted
testing and is **not the current production mode**. It permits anonymous reads
and model calls but blocks repository mutations and OIDC login/callback. See
[the runbook](deployment-runbook.md#temporary-testing-without-sso).

## Production secret mapping and rotation

ECS loads `/internal-specs/prod/runtime` JSON fields when each task starts:

| Secret field | Application environment |
| --- | --- |
| `GITHUB_TOKEN` | `GITHUB_TOKEN` |
| `GLEAN_TOKEN` | `GLEAN_API_KEY` |
| `GLEAN_CLIENT_ID` | `GLEAN_CLIENT_ID` |
| `GLEAN_CLIENT_SECRET` | `GLEAN_CLIENT_SECRET` |
| `GLEAN_ACT_AS` | `GLEAN_ACT_AS` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET` |
| `SESSION_SECRET` | `SESSION_SECRET` |

The current `GleanCredentialMode=auto` injects both Glean credential options;
only the token is populated. Preserve empty OAuth keys and configure exactly one
method. A legacy secret field named `GLEAN_API_KEY` is unused by this template.
Updating a value does not update running tasks: replace them using the operator
runbook and verify integration behavior. Session-key rotation invalidates old
cookies and requires coordinated replacement. Never paste secret values into
commands that log them, documentation, PRs, or build arguments.
