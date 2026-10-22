# Repository Guidelines

## Project Structure

AI Spec Explorer uses Next.js 15, React 19, and strict TypeScript. `app/` contains
pages/API routes; `components/SpecWorkspace.tsx` owns workspace state. `lib/`
contains auth, compiler, retrieval, GitHub, and provider transports. `specs/`
holds team parents, child specs, and `teams.json`. Tests live in `tests/`, tools
in `tools/`, CloudFormation in `infra/`, and operational guides in `docs/`.
Read [architecture.md](architecture.md) for the AWS design: private Fargate tasks,
Cognito/JumpCloud SSO, GitHub persistence, Glean compilation, and no database.

## Local Development and Validation

Use Node.js 22. Run `npm ci`, configure `.env` from `.env.example`, then
`DEV_AUTH_BYPASS=true npm run dev`. For synthetic Glean responses use
`npm run stub:glean`; GitHub still needs credentials. Use a sandbox for write tests.

Before opening a PR run `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build:verify`, `python3 tools/smoke-production.py --dist .next-verify`,
`npm audit --omit=dev --audit-level=high`, and `npm audit --audit-level=critical`.
Run additional infrastructure/workflow checks listed in
[the development workflow](docs/development-workflow.md) when relevant.

## Coding and Testing

Use two spaces, single quotes, semicolons, trailing commas, PascalCase components,
kebab-case utilities, and `@/` imports. ESLint prohibits explicit `any`; validate
external data with Zod. No Prettier configuration exists. Vitest discovers
`tests/**/*.test.ts` in Node; mock external providers and cover changed behavior
and security boundaries. No numeric coverage threshold is configured.

## Required PR and Release Flow

1. Branch from current `origin/main`; preserve unrelated changes. Use imperative
   `feat:`, `fix:`, `docs:`, or `chore:` commits.
2. Validate locally, push the topic branch, and **open a PR** with behavior,
   validation, deployment/rollback details, and screenshots for UI changes.
3. **Wait** for `application`, `infrastructure`, and `PR gate` on the latest SHA.
   Update from `main`, rerun checks after changes, and resolve review threads.
4. Squash merge when authorized. Zero reviewer approvals are required. Never
   push directly to `main`, force-push it, or bypass required checks.
5. Monitor the resulting main workflow and verify the intended image and healthy
   ECS tasks/targets before reporting deployment complete.

Every main merge, including docs/specs, triggers **production deployment**.
PRs do not deploy. Infrastructure/configuration changes use the separate
[operator runbook](docs/deployment-runbook.md).

## Security Boundaries

Keep credentials server-side and out of Git/logs/build arguments. Use
`withApiAccess` for protected routes; preserve origin checks, path confinement,
and rule citations. Team paths are not per-user RBAC. Production forbids the
development auth bypass and direct commits.
