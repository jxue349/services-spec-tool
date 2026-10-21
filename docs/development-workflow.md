# Development and Release Workflow

## Branch and develop locally

Use Node.js 22, Python 3, and GitHub CLI authenticated to the company repository.
Start from a clean working tree; preserve unrelated local changes.

```bash
git fetch origin main
git switch -c <name>/<short-change> origin/main
npm ci
cp .env.example .env
DEV_AUTH_BYPASS=true npm run dev
```

Configure `.env` as described in the README. Use `npm run stub:glean` for local
provider development. Keep credentials out of Git, logs, PRs, and Docker builds.
Local development does not require AWS deployment credentials.

## Validate before opening a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build:verify
python3 tools/smoke-production.py --dist .next-verify
npm audit --omit=dev --audit-level=high
```

For infrastructure, deployment tooling, or workflow changes, also run:

```bash
uvx --from cfn-lint==1.58.0 cfn-lint infra/foundation.yaml infra/service.yaml infra/ci.yaml
python3 -m unittest discover -s tools -p 'test_*.py'
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7
```

CI runs the complete validation on every PR, including documentation-only PRs.
Tests mock external providers; production smoke does not need real credentials.
Add regression coverage for changed behavior and security boundaries.

## Open and merge a PR

Commit with an imperative conventional subject, push the topic branch, and open
a PR targeting `main`. Use the PR template to record behavior, test evidence,
deployment impact, and rollback. Include screenshots for UI changes.

The active [main ruleset](https://github.com/wyzelabs-inc/KB-Spec-explorer/rules/25593491)
requires:

- A pull request; direct pushes, force pushes, and branch deletion are blocked.
- Successful `application`, `infrastructure`, and `PR gate` checks from GitHub
  Actions. The aggregate gate fails if either validation job fails or is skipped.
- An up-to-date branch and resolved review conversations.
- Squash merge for linear history. **Zero reviewer approvals are required**;
  the author can merge their own passing PR. There are no admin or app bypasses.

If `main` advances, use GitHub's **Update branch** or merge `origin/main` into
the topic branch, then wait for fresh checks. Do not use skip-CI commit markers,
rename required checks without updating the ruleset, or disable gates to merge.
After merge, GitHub deletes the remote topic branch automatically.

## Verify the release

PRs run checks only; they do not publish images or create preview environments.
After merge, the `main` workflow validates again, assumes the scoped AWS role
through OIDC, publishes/scans ECR, and updates ECS by image digest. Watch it with:

```bash
gh run list --workflow checks.yml --branch main --event push --limit 5
gh run watch <run-id> --exit-status
```

The **Deploy main to ECS** job must succeed. A merged PR or green PR validation
alone does not prove deployment. Check the intended digest, healthy tasks/targets,
and release summary; then perform relevant browser acceptance over VPN at
`https://internal-specs.wyze.com`. Stale queued releases may intentionally skip.

Image releases retain current auth, secrets, networking, and capacity. Template,
SSO, DNS, and other configuration changes require the separate reviewed operator
plan/apply procedure in the [deployment runbook](deployment-runbook.md). For an
application rollback, revert through a new PR and the same checks; urgent digest
rollback uses the operator procedure. Do not cancel an executing rollout casually.

## Maintain CI and repository policy

GitHub requires full commit SHAs for actions; checkout does not retain credentials.
Default workflow tokens are read-only; only the main release job requests OIDC.
Keep PR jobs free of production secrets; do not execute PR code under
`pull_request_target`. PR updates cancel obsolete checks; main releases serialize
without cancelling a running deployment. Jobs have explicit time limits.
Runners use `ubuntu-24.04` to avoid unexpected `ubuntu-latest` OS migrations;
Actions use current releases while the application remains on Node.js 22.

Dependabot opens weekly npm, Actions, and Docker update PRs after this
configuration reaches `main`. They follow the same gates and are not auto-merged.
Review major upgrades separately. CodeQL and organization security scanners
continue running; scanner advisories do not replace the required validation jobs.

The JSON files below record administrative policy; GitHub does **not** apply
them automatically. A repository administrator applies reviewed changes with:

```bash
gh api --method PUT repos/wyzelabs-inc/KB-Spec-explorer/rulesets/25593491 \
  --input .github/main-ruleset.json
gh api --method PATCH repos/wyzelabs-inc/KB-Spec-explorer \
  --input .github/repository-settings.json
gh api --method PUT repos/wyzelabs-inc/KB-Spec-explorer/actions/permissions/workflow \
  --input .github/workflow-permissions.json
gh api --method PUT repos/wyzelabs-inc/KB-Spec-explorer/actions/permissions \
  --input .github/actions-permissions.json
```

Read back effective policy using:

```bash
gh api repos/wyzelabs-inc/KB-Spec-explorer/rules/branches/main
gh api repos/wyzelabs-inc/KB-Spec-explorer/actions/permissions/workflow
gh api repos/wyzelabs-inc/KB-Spec-explorer/actions/permissions
```

Historical workflows using action tags cannot be rerun under SHA enforcement;
use the current pinned workflow. GitHub-managed security workflows continue
under their existing configuration.

Keep the required names synchronized with the workflow and never add a bypass
as a routine deployment fix. Administrators can still edit repository rules;
organization-managed rules and trusted required workflows are the next step if
policy must resist repository-admin changes.
