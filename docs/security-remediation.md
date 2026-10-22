# Security remediation (issue #9)

Remediation of the 17 alerts open on `main` at `dee3f0f` (2026-10-21):
3 CodeQL `js/incomplete-sanitization` findings and 14 Dependabot alerts.

## CodeQL: Markdown table cells

The three alerts (QA matrix export, cross-team conflict issue, change-request
PR body) escaped `|` without escaping `\`, so a value containing `\|` became
`\\|` — an escaped backslash followed by a real cell boundary — and split the
row. Impact was table corruption in GitHub-rendered issues/PRs and the
downloaded Markdown; HTML/script execution was not demonstrated (GitHub
sanitizes rendered HTML).

All three now use `lib/markdown-table.ts`:

- `markdownTableText` flattens LF/CRLF/CR line breaks and escapes `\`, `|`,
  `<` and `` ` `` so values render literally.
- `markdownTableCode` writes identifiers as code spans and falls back to
  escaped text when a value cannot be a faithful code span.

`tests/markdown-table.test.ts` parses the output with a GFM parser (`marked`)
and asserts rendered cell boundaries and text. The same cases were rendered
through GitHub's own `POST /markdown` (gfm mode) and produced the intended
cells and literal text.

## Dependencies

| Package | Before | After | How |
| --- | --- | --- | --- |
| `tinypool` | 1.1.1 | removed | Vitest 4 no longer depends on it |
| `vitest`, `@vitest/mocker` | 3.2.7 | 4.1.12 | `vitest@^4.1.12` |
| `vite` | 7.3.6 | 8.3.5 | via Vitest 4 / `vite-node@^6` |
| `postcss-selector-parser` | 6.1.4 | 7.1.7 | `overrides` (Tailwind 3 has no 7.x release) |
| `brace-expansion` | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | lockfile refresh |
| `katex` (runtime) | 0.16.47 | 0.18.10 | `mermaid@^12.2.0` |

Compatibility notes:

- `vite-node` was a transitive Vitest 3 dependency used by
  `npm run migrate:rule-ids`; it is now an explicit dev dependency.
- Vitest 4 constructs `vi.fn` mocks called with `new` only from `function`
  implementations; `tests/bedrock.test.ts` was updated.
- Mermaid 12 defaults to ELK layout and the `neo` look. `StatesTab` sets
  `layout: 'dagre'` and `look: 'classic'`; a sample state machine renders in
  a browser with the app's config.
- `postcss-selector-parser` 7.0.0's only breaking change is safe insertion
  during iteration. The built CSS is byte-identical to the baseline except for
  an unused `.inline` utility that Tailwind had generated from a removed
  `inline()` function name in `app/`.
- The `postcss` override is unchanged in effect; npm 10.9 fails to resolve it
  alongside the new overrides, so the lockfile was generated with npm 11.
  `npm ci` with npm 10 installs it cleanly.

## Audit results after remediation

- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `npm audit --audit-level=critical`: passes.
- `npm audit --audit-level=high`: fails on one residual advisory, below.

### Residual: `braces` GHSA-vfj7-8cjw-p6xm (high, development only)

Published 2026-09-18 with no patched release (`<= 3.0.3`, the latest). It
reaches the repo only through Tailwind 3 (`chokidar`, `micromatch`) and
`eslint-config-next` (`fast-glob`) at build/lint time, which expand glob
patterns from repository configuration, not user input. It was not one of the
17 alerts. Resolution is a patched `braces` release or a Tailwind 4 migration;
until then CI fails on any critical advisory and dependency review blocks PRs
that introduce new high/critical advisories.

## CI

`checks.yml` (`application` job) adds `npm audit --audit-level=critical` and,
on pull requests, `actions/dependency-review-action` failing on high severity
across runtime and development scopes. Both run inside the required
`application` check, so no ruleset change is needed.

Still open (repository settings, not changed here): enabling Dependabot
security updates, and code-scanning merge protection so open high CodeQL
alerts block merges.
