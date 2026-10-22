# Multi-Team Specifications

The multi-team workspace is implemented. GitHub is the source of truth, and
teams are discovered from folders under `SPEC_ROOT` containing `parent.md`.
The optional `teams.json` supplies display names, ordering, descriptions, and
rule-ID codes; a missing or malformed manifest does not hide discovered teams.

## Current layout

```text
specs/
  teams.json
  hardware/parent.md                  # HW Team / HW
  services/parent.md                  # Services / SVC
  services/cam-plus/behavior.md
  services/upsell/behavior.md
  app-experience/parent.md             # App Experience / APPEX
  platform/parent.md                   # Platform Team / PLAT
  others/parent.md                     # Others / MISC
```

`SPEC_DEFAULT_TEAM=services` selects the initial team. A child such as
`specs/services/cam-plus/behavior.md` resolves to `specs/services/parent.md`.
`SPEC_PARENT_PATH` is a fallback for legacy flat layouts; it does not replace
other teams' parents. Paths are confined to the configured spec subtree.

To add a team, create `<SPEC_ROOT>/<team-slug>/parent.md` and optionally add its
entry to `teams.json`. Use lowercase, hyphenated directory names, a stable
unique team code, and child directories containing Markdown specs. Submit the
change through the [normal PR workflow](development-workflow.md).

## Ask and cross-team reads

Ask can use the selected specification or an all-teams scope. Federated retrieval
reads team parent knowledge bases and divides context among matching teams so
one large knowledge base does not consume the whole budget. A selected parent
editor draft can replace that parent's committed text for the question.

Answers identify cited rules and teams. The compiler contract requires conflicts
to be reported rather than silently resolved and limits confidence when teams
disagree. These are generated answers: inspect the cited rules before deciding
which specification should change. Federated Ask itself performs no writes.

The optional Glean company-knowledge answer is separate from this GitHub-based
cross-team search and is disabled in production.

## Compare and proposed changes

**Compare** checks a child against its own team's parent. Requesting a parent
change opens a PR: new rules are appended with deduplication, while conflicting
rules are described for the owners to resolve. A conflict-only request records
a Markdown report alongside the parent instead of rewriting its rules.
The route never commits directly to the base branch.

Gap reports target the selected spec's parent. Cross-team reports create GitHub
issues with cited positions and the owning team's followers; they do not rewrite
another parent's content. GitHub issue permissions are required in addition to
Contents and Pull requests permissions. Save, upload, and initialization also
use PRs in production; app-created PRs must pass the repository's normal gates.

## Access and followers

All users assigned to `wyze-internal-specs-users` can read and propose changes
across teams. **There is no per-user team RBAC.** Team path resolution restricts
where an operation writes, not which employee may select a team. Authentication,
origin checks, and production direct-commit denial apply to all write routes.

Optionally place `followers.txt` beside a team's `parent.md`, with one GitHub
username per line. Blank lines and `#` comments are ignored; leading `@` is
accepted. The service requests eligible followers as PR reviewers and mentions
those GitHub refuses in the PR body. Followers are notification/review routing,
not an authorization list or a required-approval gate.

## Rule IDs and migration

Use team-prefixed IDs such as `SVC-ENT-007` or `HW-PLUGINPAGE-001` so citations
identify their owner. `lib/rule-id.ts` centralizes parsing/matching. Legacy
unprefixed citations remain supported; two explicitly different team prefixes
must never be treated as the same rule.

Preview a migration with the configured repository credentials:

```bash
npm run migrate:rule-ids
```

Inspect the proposed renames and repository/branch before applying:

```bash
npm run migrate:rule-ids -- --apply
```

Apply opens one PR across changed team files; it does not commit to `main`.
The migration targets defined rule IDs and preserves URLs/source references.
Review the diff, wait for CI, and merge using the standard workflow. Because
specs and application code share this repository, the merge also triggers the
production image pipeline.

## Relevant implementation and checks

- `lib/teams.ts`: discovery, manifest parsing, naming, and owning-parent resolution.
- `lib/federated-retrieval.ts`, `lib/team-knowledge.ts`: cross-team context.
- `lib/rule-id.ts`, `lib/migrate-rule-ids.ts`: IDs and migration.
- `lib/resolve-spec-path.ts`, `lib/spec-paths.ts`: path validation.
- `app/api/spec/request-change/route.ts`, `app/api/cross-team/report/route.ts`:
  parent-change proposals and cross-team reports.

Run `npm test` before changing these contracts. Preserve coverage for owning-parent
selection, path traversal rejection, citation matching, duplicate additions,
federated reads without writes, and safe Markdown serialization.
