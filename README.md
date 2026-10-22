# AI Spec Explorer

Explore, compare, and maintain Wyze product behavior specifications stored in
GitHub. The application uses Next.js 15, React 19, and strict TypeScript. Glean
generates structured answers from the selected specification and its rule IDs;
Amazon Bedrock is an optional compiler implementation.

**Production:** [internal-specs.wyze.com](https://internal-specs.wyze.com).
Connect through an approved company VPN or office network and sign in with
JumpCloud. Access requires assignment to `wyze-internal-specs-users`; Cognito
bridges JumpCloud SAML to the application's OIDC login. SSO is enabled.

## Workspace

Select a team and a parent knowledge base or child specification. The workspace
provides six tabs:

| Tab | Purpose |
| --- | --- |
| Ask | Answer questions with rule-ID citations; optionally search across team knowledge bases. |
| Compare | Compare a child specification against its own team's parent and propose parent changes. |
| Behavior Explorer | Turn the current specification into structured behavior rows. |
| QA Test Matrix | Generate test cases from the specification. |
| State Machine | Generate and render a Mermaid state diagram. |
| Consistency Check | Identify contradictions and ambiguities within the specification. |

Editor changes remain in browser memory until submitted. Saving creates a
branch and pull request; production disables direct commits. Upload `.md` or
`.txt` files up to 100 KiB to propose new specs, download committed Markdown,
and inspect GitHub history. Gap reports and cross-team reports use GitHub issues.
All assigned users can read and propose changes across teams; team path checks
do **not** implement per-user team permissions.

## Local setup

Use Node.js 22 and a GitHub token for the configured repository. Start from a
topic branch based on current `origin/main`.

```bash
npm ci
test -f .env || cp .env.example .env
```

Configure `.env` using [the configuration guide](docs/configuration.md). The
example uses `wyzelabs-inc/KB-Spec-explorer`, `specs/`, and the `services` team.
Use a separately scoped sandbox repository when exercising writes.

For local development with real GitHub and Glean credentials:

```bash
DEV_AUTH_BYPASS=true npm run dev
```

Open `http://localhost:3000`. The bypass is development-only; production rejects
it. To use synthetic Glean responses, run `npm run stub:glean` in another terminal,
set `GLEAN_BASE_URL=http://127.0.0.1:3399` and
`GLEAN_API_KEY=local-stub-token`, and leave the Glean OAuth fields empty. GitHub
still needs a real token. The stub tests the integration flow, not model quality.

## Commands and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port 3000. |
| `npm run lint` / `npm run typecheck` | Check ESLint rules and strict TypeScript types. |
| `npm test` / `npm run test:watch` | Run Vitest once / in watch mode. |
| `npm run build:verify` | Build into `.next-verify` without replacing the development build. |
| `python3 tools/smoke-production.py --dist .next-verify` | Check production startup, authentication, and API boundaries with controlled fixtures. |
| `npm run build` / `npm start` | Build / serve production locally; production configuration checks still apply. |
| `npm run stub:glean` | Start the local Glean stand-in on port 3399. |
| `npm run migrate:rule-ids` | Preview team-prefixed rule-ID migration; see the multi-team guide before applying. |

Before a PR, run lint, typecheck, tests, build verification, production smoke,
`npm audit --omit=dev --audit-level=high`, and
`npm audit --audit-level=critical`. Tests live in `tests/**/*.test.ts`, use Vitest's
Node environment, and mock external integrations. No numeric coverage threshold
is configured. See [the development workflow](docs/development-workflow.md) for
infrastructure checks and the complete release procedure.

## Project structure

```text
app/                 Pages and API route handlers, including OIDC endpoints
components/          SpecWorkspace, tabs, editor, and sign-in UI
lib/auth/            OIDC, signed sessions, access and origin checks
lib/providers/       Glean, optional Glean knowledge lookup, and Bedrock
lib/                 Compiler, schemas, GitHub, retrieval, teams, and rule IDs
specs/               Team manifest, parent knowledge bases, and child specs
tests/               Application tests
tools/               Glean stub, smoke tests, migration, and AWS release tooling
infra/               Foundation, service, CI-role, and Cognito CloudFormation
.github/             Checks/deployment workflow and repository policy snapshots
docs/                Configuration, development, deployment, and SSO guides
```

`components/SpecWorkspace.tsx` owns workspace state; `app/page.tsx` enforces
page access. `lib/compiler.ts` sends provider-neutral prompts and validates JSON
against Zod schemas, with one corrective retry. `lib/providers/glean.ts` is the
Glean transport. Team discovery, retrieval, and write-path resolution are
described in [the multi-team guide](docs/multi-team.md).

## Integrations and security boundaries

- **GitHub** stores specifications, history, PRs, issues, and follower files.
  A server-side token acts for the service; users do not connect personal GitHub
  accounts. Signed-in identity is recorded for attribution.
- **Glean** is the production compiler. `GLEAN_AGENT=GPT` requests spec-only
  generation. Optional company-knowledge lookup is a separate answer panel and
  is disabled in production. No direct Jira, Confluence, or Slack credentials
  are needed by this application.
- **Cognito and JumpCloud** authenticate users. Secure, HttpOnly signed session
  cookies last eight hours. Local sign-out clears the application's cookie;
  it does not globally sign out of JumpCloud or immediately revoke other sessions.
- **AWS** runs the service; there is no application database, Redis, or vector
  store. GitHub is the persistent source of truth. Request limits are in memory
  per task, not a cluster-wide quota.

Credentials remain server-side and must never appear in commits, client bundles,
logs, or Docker build arguments. Repository/spec metadata can be shown in the UI.
Protected API routes use `withApiAccess` and same-origin checks for mutations.
Ask/compile limits use the signed-in identity. Production rejects the development bypass and direct
commits. Health checks do not prove that upstream integrations are working.

## Contributing and deployment

Follow [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and
[the development workflow](docs/development-workflow.md):

1. Branch from current `origin/main`, develop locally, and run the required checks.
2. Push the topic branch and **open a PR** targeting `main` with validation and rollback details.
3. **Wait** for `application`, `infrastructure`, and `PR gate` to pass on the
   latest PR commit. Update from `main` and resolve review threads. No other
   person's approval is required; bypassing the rules is prohibited.
4. Squash merge. The resulting `main` push validates again, publishes/scans an
   immutable ECR image, and deploys it to ECS.
5. Monitor the main workflow and verify the intended image, healthy tasks and
   targets, and relevant application behavior before reporting deployment complete.

PRs validate only. There is **no separate development or preview deployment**;
merging to `main` triggers **production deployment**, including documentation-
and specification-only merges. The automated release updates only the image;
infrastructure, SSO, DNS, and runtime configuration changes require the operator
procedure and are not applied merely by merging templates.

## Documentation

- [Architecture and AWS setup](architecture.md): components, network, authentication, storage, and release design.
- [Configuration](docs/configuration.md): local settings, GitHub/Glean credentials, and production secret mapping.
- [Multi-team specifications](docs/multi-team.md): discovery, paths, rule IDs, and change proposals.
- [Development workflow](docs/development-workflow.md): local validation, PR gates, merge, and release verification.
- [Deployment runbook](docs/deployment-runbook.md): operator changes, secret rotation, DNS, and rollback.
- [Deployment master plan](docs/deployment-master-plan.md): dated deployment evidence and remaining acceptance work.
- [Cognito and JumpCloud SSO](docs/cognito-sso.md): IT values, claim mapping, and login verification.
- [Security remediation](docs/security-remediation.md): resolved findings and known dependency advisories.
