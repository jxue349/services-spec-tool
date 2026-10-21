# Repository Guidelines

## Project Structure & Module Organization

AI Spec Explorer is a Next.js 15 application using React 19 and TypeScript.

- `app/` contains pages, global styles, and API handlers (`app/api/**/route.ts`).
- `components/` contains React UI components; styling uses Tailwind CSS.
- `lib/` contains compilation, retrieval, GitHub integration, authentication, and Zod schemas. Provider transports live in `lib/providers/`; browser helpers live in `lib/client/`.
- `specs/` holds the team registry and Markdown knowledge bases, such as `specs/services/parent.md` and `specs/services/cam-plus/behavior.md`.
- `tests/` holds automated tests; `tools/` holds development utilities; `docs/` records design decisions.

## Build, Test, and Development Commands

Use Node.js 22 to match the Docker image. Install dependencies with `npm ci`, then copy `.env.example` to `.env` and configure it using the README.

- `npm run dev`: start development at `http://localhost:3000`.
- `npm run build` and `npm start`: build and serve production locally.
- `npm run build:verify`: build into `.next-verify` while the development server remains running.
- `npm run lint` and `npm run typecheck`: check ESLint rules and strict TypeScript types.
- `npm test`: run all Vitest tests once; `npm run test:watch` enables watch mode.
- `npm run stub:glean`: start the local Glean stand-in; see README configuration. GitHub operations still require credentials.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single-quoted TypeScript strings, semicolons, and trailing commas. Name components in PascalCase (`TeamSelector.tsx`) and utility modules in kebab-case (`spec-paths.ts`). Use `@/` for root imports. TypeScript is strict; ESLint enforces Next.js rules and prohibits explicit `any`. Validate external data with Zod. No Prettier configuration is present.

## Testing Guidelines

Vitest runs in Node and discovers `tests/**/*.test.ts`. Use descriptive `describe`/`it` cases and mock external HTTP/provider calls. Cover changed behavior, validation failures, and relevant authentication or path boundaries. Run a focused file with `npm test -- tests/auth.test.ts`. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow Git history: concise imperative subjects with `feat:`, `fix:`, `docs:`, or `chore:`; optional scopes include `fix(stub):`. PRs should explain the problem, resulting behavior, and validation, link relevant issues, and include screenshots for UI changes. Run lint, typecheck, tests, and a verification build for code changes.

## Security & Configuration

Keep credentials server-side and out of commits, client bundles, and Docker build arguments. Preserve team-scoped write boundaries and rule-ID citations when changing retrieval or compilation.
