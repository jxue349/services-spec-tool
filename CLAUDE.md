# Contributor Instructions

@AGENTS.md

Use [README.md](README.md) for setup, [architecture.md](architecture.md) for the
current application/AWS design, and [the development workflow](docs/development-workflow.md)
for executable validation and release steps. Production uses Cognito/JumpCloud,
GitHub-backed specifications, and Glean; it has no application database.

## Required SDLC

1. Start a topic branch from current `origin/main`; develop and test locally.
2. Run the required lint, typecheck, tests, production build/smoke, and audit
   commands, plus infrastructure/workflow checks when relevant.
3. Push the topic branch and **open a PR** targeting `main`. Include behavior,
   validation, deployment impact, rollback, and UI screenshots where relevant.
4. **Wait for successful `application`, `infrastructure`, and `PR gate` checks
   on the latest PR SHA.** Update from `main` and resolve review conversations;
   any new commit requires fresh checks. Do not bypass rules or push to `main`.
5. Squash merge when authorized; another person's approval is not required.
6. Monitor the resulting main workflow through **Deploy main to ECS** and verify
   the intended digest and healthy tasks/targets. A green PR or merged PR alone
   is not a completed deployment. Report failures and unresolved acceptance work.

Merging any change, including docs/specs, triggers **production deployment**;
there is no PR preview or separate development environment. Automated releases
change only the image. Apply infrastructure, SSO, DNS, and runtime configuration
through [the operator runbook](docs/deployment-runbook.md), preserving live settings.
Never include secret values in code, docs, logs, PRs, or Docker build arguments.
