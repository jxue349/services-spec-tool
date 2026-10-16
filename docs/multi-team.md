# Multi-team specs — design note

Built, except where marked. This records the shape and the decisions it turns
on, so the next person does not have to re-derive them.

Status: all four decisions are made and built — the layout and registry
(`lib/teams.ts`, `GET /api/teams`, `TeamSelector`), **federated read with
siloed write** (`lib/federated-retrieval.ts`, `lib/team-knowledge.ts`, the
`teams` scope on `POST /api/ask`), **team-prefixed rule IDs**
(`lib/rule-id.ts`, `lib/migrate-rule-ids.ts`, `npm run migrate:rule-ids`), and
**cross-team filing without write access** (`lib/cross-team.ts`,
`POST /api/cross-team/report`).

## The shape

Each team owns a folder containing its own parent spec (that team's knowledge
base) and its child specs:

```
specs/
  service/            parent.md  — subscriptions, entitlement, upsell
    cam-plus/behavior.md
    upsell/behavior.md
  app-experience/     parent.md  — information architecture
    nav/behavior.md
  hardware/           parent.md  — HW features, and SW features on the plugin page
    plugin-page/behavior.md
```

This is one nesting level above what exists. Today's `spec/` directory *is*
one team's folder; the generalisation is N of them side by side.

## What already generalises

Most of the system never knew about teams and does not need to:

- **Retrieval, rule parsing, the compilers, Ask, the QA matrix, the state
  machine** all operate on one document's text.
- **Path validation** is root-relative. `assertSpecPath('specs/service/x.md',
  'specs/service')` passes and `specs/other/x.md` is rejected, with a test
  covering nested roots.
- **Versioning, download naming, history, authorship and sign-in** are
  per-path or per-user, not per-team.
- **Followers** already live beside each parent (`followers.txt`), so each
  team's knowledge base gets its own reviewers for free.

Consequence worth knowing: **one team can move to the target layout right
now**, with no code change, by pointing `SPEC_ROOT` and `SPEC_PARENT_PATH` at
`specs/<team>`. Doing that before the repo fills up turns the eventual
multi-team change into an additive feature rather than a migration.

## What has to change

`SPEC_ROOT` and `SPEC_PARENT_PATH` are single values read from the
environment. They would become a registry — a committed `specs/teams.json`,
or discovery of any directory under `specs/` containing a `parent.md` — plus a
"current team" resolved per request. Seventeen files reference the two values
today, but nearly all of them only pass them through; the ones with real
decisions in them are `resolve-spec-path`, `spec/list`, `request-change` and
the selector.

## The three decisions this turns on

### 1. Cross-team references — the one that matters

The hardware team's plugin-page spec will cite app-experience IA rules, and
probably service entitlement rules too. A support question like *"what does
the plugin page show for a Cam Plus user?"* spans three teams.

Options:

- **Siloed.** Ask and Parent Check stay inside the selected team. Simple,
  and wrong for exactly the questions that are hardest to answer today.
- **Federated read, siloed write.** Ask may retrieve across every team's
  parent, with each cited rule labelled by team; changes still go only to the
  owning team's parent. Answers the cross-team question without letting one
  team quietly rewrite another's rules.
- **Fully cross-linked.** A child spec declares which parents it depends on,
  and Parent Check runs against all of them. Most faithful, most machinery,
  and needs a dependency declaration in every spec.

Federated read with siloed write is the recommendation: it matches how the
organisation actually works, and the write boundary is where the risk is.

**Decided and built.** Ask gained an "all N teams" scope. How it works, and
the two things that were not obvious going in:

- **Per-team retrieval budgets.** The budget is split evenly across the teams
  that match, floored at 2,000 characters each, with the remainder
  redistributed to whoever had more to say. One pooled ranking would let
  Services' 172 rules fill the context and the contradicting three-rule
  hardware knowledge base would never reach the model — which would quietly
  defeat the only reason to read across teams at all.
- **Conflicts are reported, never resolved.** When two teams define the same
  behavior incompatibly, the answer says so, names both rules, and sets
  confidence no higher than medium. It does not pick a winner, average the
  two, or quietly answer from one. Same rule Parent Check follows for
  contradictions, for the same reason: which knowledge base is right is a
  product decision for their owners, and a tool that decides it silently
  turns a visible conflict into a confidently wrong answer.

The write boundary holds: the federated path only reads, the gap-flagging
action files against the selected team's own knowledge base, and no route
that writes accepts a scope. A test asserts that a federated answer calls no
write method on the repo client.

The caller's uncommitted editor draft is substituted for that team's
committed parent, so "I just changed this rule — does it now contradict
another team?" is answerable before the change lands rather than after.

### 2. Rule ID namespacing across teams

`namespaceFor` derives a prefix from the spec's directory, so
`hardware/plugin-page` and `app-experience/plugin-page` would both yield
`PLUGINPAGE`. With one parent that was impossible; with several it is likely.
The prefix needs the team in it (`HW-PLUGINPAGE-001`), which is a change to
the ID convention and therefore to existing specs.

**Decided and built.** `ENT-007` is now `SVC-ENT-007`, so an ID pasted into a
ticket says who owns the rule. What this turned on:

- **The grammar lives in one module** (`lib/rule-id.ts`). It was duplicated
  in `spec-retrieval` and `client/rules`; two copies were survivable while
  the grammar was fixed, and are not now, because a question that reaches
  retrieval but not the rule chip is a bug nobody would think to look for.
- **A team prefix is an explicit list, never "any leading segment."** The
  loose reading would make `R-101` resolve to `CAMPLUS-R-101`, sending a
  parent's citation into a child spec — a guarantee the old exact-match code
  gave for free.
- **Two prefixed IDs must name the same team.** `SVC-ENT-007` and
  `HW-ENT-007` are different rules; matching them on the shared `ENT-007`
  would undo the migration's whole purpose.
- **Old citations keep resolving.** A bare `ENT-007` from a Jira ticket
  written before the migration still finds `SVC-ENT-007`, in retrieval, in
  the rule chip, and in the additions dedupe. Without that, every existing
  citation goes dead on merge day.
- **Only defined IDs are renamed.** The Source column is full of Jira keys
  shaped exactly like rule IDs; they are never in definition position, so
  they are never in the rename set. URLs are masked during the rewrite.

`npm run migrate:rule-ids` is a dry run; `-- --apply` opens one pull request.
It is idempotent, and the invariant worth re-checking on any future run is
that the migrated document is byte-identical to the original once the team
prefix is stripped back out.

### 3. Who may write where

Followers already scope *review* per parent. Write gating is separate: should
an app-experience PM be able to open a change request against the service
parent? Probably yes — a cross-team request is how disagreements surface —
but it should be visibly a cross-team request, and the owning team's
followers are the ones who approve it.

**Decided and built: file across teams, write only your own.** Granting real
cross-team write was rejected as more machinery than the problem needs, so a
team raises a conflict against another team's knowledge base in the weakest
form that works — an issue (`POST /api/cross-team/report`, label
`cross-team-conflict`).

- It changes nothing in the other team's spec, which is precisely what lets
  it need no write access to that spec. A test asserts the route calls no
  write method on the repo client.
- It is addressed to the **owning** team's followers, not the reporter's, and
  says on its face that it was raised from outside and that nothing was
  changed.
- Dedupe is keyed on the pair of rule IDs alone — not the topic (two people
  describe the same clash differently) and not the team labels, which are
  model-generated text that varies between "Services", "SVC" and
  "Services (SVC)". `matchTeamLabel` absorbs that variance on the way in.

Two routes were filing against the globally configured parent regardless of
team, which this fixed: `/api/spec/request-change` was merging a hardware
spec's rules into the services knowledge base, and `/api/gaps` was notifying
the services followers about every team's gaps.

## Sequencing

1. ~~Move to `specs/<team>/`~~ — done.
2. ~~Registry and team selector~~ — done.
3. ~~Federated read across parents, with per-team labels on citations~~ —
   done.
4. ~~Team-prefixed rule IDs~~ — done, and the migration is applied.
5. ~~Cross-team filing without write access~~ — done.
