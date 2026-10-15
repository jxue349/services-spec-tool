# Multi-team specs — design note

Not built. This records the intended shape and the decisions it turns on, so
the next person does not have to re-derive them.

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

1. Move to `specs/<team>/` now, one deployment per team. No code change.
2. Add the registry and the team selector. Ask and Parent Check stay within a
   team; everything else already works.
3. Federated read across parents, with per-team labels on citations.
4. Team-prefixed rule IDs, once more than one team has real specs — cheap
   now, expensive after the IDs are cited in tickets.
