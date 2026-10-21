# Repository Guidelines

## Project Structure & Module Organization

AI Spec Explorer is a Next.js 15 application using React 19 and TypeScript.

- `app/` contains pages and API handlers (`app/api/**/route.ts`); `components/` holds React UI.
- `lib/` contains compilation, retrieval, integrations, authentication, and schemas.
- `specs/` holds team registries and Markdown knowledge bases.
- `tests/` contains automated tests; `tools/` holds utilities; `docs/` records decisions; `infra/` holds CloudFormation templates.

## Build, Test, and Development Commands

Use Node.js 22. Run `npm ci`, then configure `.env` from `.env.example` using the README.

- `npm run dev`: start development at `http://localhost:3000`.
- `npm run build` / `npm start`: build / serve production locally.
- `npm run build:verify`: build into `.next-verify` while the development server remains running.
- `npm run lint` and `npm run typecheck`: check ESLint rules and strict TypeScript types.
- `npm test`: run Vitest; `npm run test:watch` enables watch mode.
- `npm run stub:glean`: start the local Glean stand-in. GitHub still requires credentials.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, semicolons, and trailing commas. Name components in PascalCase and utilities in kebab-case. Use `@/` for root imports. TypeScript is strict; ESLint prohibits explicit `any`. Validate external data with Zod. No Prettier configuration is present.

## Testing Guidelines

Vitest runs in Node and discovers `tests/**/*.test.ts`. Use descriptive `describe`/`it` cases and mock external HTTP/provider calls. Cover changed behavior, validation failures, and relevant authentication or path boundaries. Run a focused file with `npm test -- tests/auth.test.ts`. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow Git history: imperative subjects with `feat:`, `fix:`, `docs:`, or `chore:`. Start a topic branch from current `origin/main`; develop locally, then run lint, typecheck, tests, build/smoke, and dependency audit using [the development workflow](docs/development-workflow.md). Validate infrastructure/workflows when changed. Push the topic branch and open a PR with behavior, validation, rollback, and UI screenshots where relevant.

Never push directly to `main`, bypass checks, or force-push `main`. Required checks are `application`, `infrastructure`, and `PR gate`; update from `main` and resolve review threads before squash-merging. No reviewer approval is required. PRs validate only; merging triggers ECR publication and ECS deployment. Confirm the release result before reporting deployment complete. Infrastructure changes use the separate operator procedure in [the runbook](docs/deployment-runbook.md).

## Security & Configuration

Keep credentials server-side and out of commits, client bundles, and Docker build arguments. Preserve team-scoped write boundaries and rule-ID citations when changing retrieval or compilation.
