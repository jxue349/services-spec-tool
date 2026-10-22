# Idea → PRD → Spec → Analytics → QA — design note

Not built. This records the shape, what already exists, and the three things
the build turns on, so the next person does not re-derive them.

## The pipeline

```
  idea ──▶ validate ──▶ PRD ──▶ spec ──▶ analytics events ──▶ QA
           "why now"           (rules)    (Firebase)         (incl. event tests)
```

Stage by stage, and who does the work today:

| Stage | What it does | Exists? |
| --- | --- | --- |
| Validate | Grill the idea, find prior art, mine Zendesk / community / reviews, propose the analysis that would prove it | Skills, in Claude Code |
| Optimise | Critique an existing design, propose changes | `wyze-design-feedback` skill |
| PRD | Turn the validated idea into a PRD | `pm-execution:create-prd` skill |
| Spec | Distil the PRD into rules: user stories, conditions, expected behaviour | **Built** — this tool |
| Measurement | Success metrics attached to the spec | Not built |
| Analytics | Derive Firebase events from the behaviours, in house convention | Not built |
| Check | Compare new events against what the apps already fire | **Built** — mechanism only |
| QA | Test cases, including analytics-event tests | **Built** — behaviour only |

The second half is largely this tool already. The first half is research and
writing, which the skills already do well. The interesting question is how
they meet.

## Decision 1: where do the skills run? — the one that matters

Skills are Claude Code constructs: markdown instructions the harness loads
into a session. This app is a Next.js service that calls Glean or Bedrock
over HTTP. **It cannot invoke a skill.** `anthropic-skills:grilling` is not
even a file on this machine — the harness serves it — so the app could not
read it even if we wanted to.

Three ways out:

- **Port the skills into prompts.** Copy each skill's content into the app's
  prompt library. The app stays one product. Cost: every ported skill is a
  fork that drifts from the original the day someone improves it, and the
  remote ones cannot be ported at all without someone pasting them in.
- **Build the whole thing in Claude Code.** A plugin: skills compose
  natively, no porting, no drift. Cost: no web UI, and every PM needs Claude
  Code and a repo checkout. The current web tool becomes the odd one out.
- **Split at the PRD.** Claude Code skills own idea → validated → PRD, and
  write a PRD document. The web tool owns PRD → spec → analytics → check →
  QA. The handoff is a file in the repo.

**Recommendation: split at the PRD.** It is the only option where nothing is
forked and nothing is rebuilt. It also matches where the work changes
character: everything before the PRD is open-ended research with a human in
the loop, everything after is deterministic compilation against a knowledge
base — which is exactly what this tool is already good at. The PRD is a real
artifact teams already review, so it is a natural seam rather than an
invented one.

The cost to be honest about: two surfaces. A PM validates in Claude Code and
specs in the browser. That is a worse demo and a better product, and it can
be narrowed later by having the web tool shell out to Claude Code for the
research stages if the seam proves annoying.

## Decision 2: is the analytics registry a team, or something new?

The tool already models "a folder with a `parent.md` is a team with its own
knowledge base". An analytics event registry fits that shape almost exactly:
it is a body of rules, owned by a group, that other specs must not
contradict. Making it a team means Ask, federated read, cross-team conflict
reporting and the filing flow all work on it for free.

Almost. **Event names do not parse as rule IDs.** Verified:

```
no   services_hero_viewed
no   wyze_iapT3_page_viewed
no   Ev_ST_player_open
YES  ADDON-005
```

`parseRuleBlocks` finds **zero** rules in an analytics event table. The
grammar in `lib/rule-id.ts` expects `DOMAIN-###`; event names are snake_case
identifiers. So the registry needs either a second identifier grammar or an
ID column alongside the event name (`SVC-EVT-001 | services_hero_viewed`).

An ID column is the cheaper and better answer: it keeps one grammar, lets an
event be renamed without breaking every citation, and makes the registry
diffable the same way every other spec is. The event name becomes a field of
the rule, not its identity.

## Decision 3: which convention is the registry written in?

This is the live problem, not a hypothetical. The apps currently fire **at
least three** conventions:

| Convention | Example | Where |
| --- | --- | --- |
| `page_area_action` | `services_hero_viewed` | Services page tracking plan (2026) |
| `wyze_*`, mixed case | `wyze_iapT3_page_viewed`, `wyze_Event_iap_purchase_succeed` | IAP, camera, legacy app |
| `Ev_<FEATURE>_*` | `Ev_ST_player_open`, `Ev_VS_*`, `Ev_DA_*` | Stories, Video Search, Descriptive Alerts |

iOS and Android diverge inside the legacy set — `wyze_Ev_iap_sku` on Android
against `wyze_Event_iap_purchase_succeed` on iOS for the same purchase.

So the registry cannot be "the convention". It has to record **what is
actually fired, per platform, with a status**, and separately record which
convention new events should follow. The existing status vocabulary already
carries this: ✅ fired in production, ⚠️ documented but unverified, ⛔
superseded by a newer event. The user's own inventory says outright that it
"is not a verification that each event is currently firing in production" —
so most of it seeds as ⚠️, and verifying it is its own piece of work.

This also means the conflict check has real work to do on day one, which is
the argument for building it.

## Sources for the registry

- `firebase_analytics_events_and_definitions.md` — Glean artifact, the fullest
  inventory. Self-described as unverified.
- Services Page — Firebase Analytics Tracking Plan (Confluence) — the cleanest
  convention statement, plus the GA4 constraints (≤40 chars, snake_case, ≤25
  params, register custom dimensions).
- IAP Firebase Analytics Tracking (Confluence) — the legacy IAP set, per platform.
- Camera Events - Firebase (Confluence) — camera/plugin events, 2022 vintage.
- Stories_Analytics_Event_Spec (OneDrive) — the `Ev_ST_*` set, proposed not shipped.

## Prior art worth not duplicating

There is already a Glean agent, **Event Tracking Spec Writer** (Sarah Liu),
that writes tracking specs and is explicitly instructed to search Confluence
and the Firebase spreadsheets for existing event names before proposing a new
one. That is the same job as decision 2's conflict check.

Before building, find out whether it is used. If it is, the right move may be
to feed the registry rather than replace the agent — this tool's advantage is
that it is versioned, diffable and reviewed in Git, which a Glean agent is
not. Competing with it on generation would be waste.

## What is genuinely new work

Everything else is already built or is a skill.

1. An analytics registry seeded from the sources above, with an ID column.
2. PRD ingestion: a PRD document in, a draft spec out.
3. A measurement section on the spec — success metrics per rule.
4. Event derivation: behaviours in the spec → proposed events in house
   convention, checked against the registry for collisions and near-duplicates.
5. QA generation extended to emit event-tracking test cases (did it fire, once,
   with the right params, on both platforms).
