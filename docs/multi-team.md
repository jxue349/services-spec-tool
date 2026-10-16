# Multi-team specs — design note

Built, except where marked. This records the shape and the decisions it turns
on, so the next person does not have to re-derive them.

Status: the layout, the registry and the selector are in (`lib/teams.ts`,
`GET /api/teams`, `TeamSelector`). **Federated read with siloed write** is in
(`lib/federated-retrieval.ts`, `lib/team-knowledge.ts`, the `teams` scope on
`POST /api/ask`). Team-prefixed rule IDs are supported by `teamNamespaceFor`
but not yet applied to existing spec content. Cross-team write permission is
still undecided — see decision 3.

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

### 3. Who may write where

Followers already scope *review* per parent. Write gating is separate: should
an app-experience PM be able to open a change request against the service
parent? Probably yes — a cross-team request is how disagreements surface —
but it should be visibly a cross-team request, and the owning team's
followers are the ones who approve it.

## Sequencing

1. ~~Move to `specs/<team>/`~~ — done.
2. ~~Registry and team selector~~ — done.
3. ~~Federated read across parents, with per-team labels on citations~~ —
   done.
4. Team-prefixed rule IDs, once more than one team has real specs — cheap
   now, expensive after the IDs are cited in tickets. **Still outstanding**:
   the existing knowledge base uses bare `DOMAIN-###`, so a federated answer
   can currently cite `ADDON-014` and `HW-007` without the IDs themselves
   saying which team owns them. The team label on each citation covers this
   in the UI; it does not cover an ID pasted into a ticket.
