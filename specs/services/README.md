# Service & Subscription Management — Rule-Based Knowledge Base

**Owner:** Product > Services > App Experience (Jing Xue)
**Derived from:** KB v3.3 (2026-10-22), including the Golden QA v1 distillation.
**Page mirror:** [Confluence overview page](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4498096133) — generated from this repo; never hand-edit the mirror.

## Structure

```
kb/
  README.md            this file — governance + how to change rules
  rules/               one file per domain, one rule per heading
  register.md          verification & conflict register (V-xx)
  golden-qa/           regression Q&A sets, each answer tagged with rule IDs
```

Every rule is one `###` heading:

```markdown
### ADDON-019 — Cloud CVR replay & T1 dependency
- source: Golden QA v1 Q8/Q10

Rule text in plain prose…
```

Fields: `source` (always), `refs` (register items or related rules, when relevant),
`superseded-by` (tombstones only). Rule IDs are permanent; anchors like
`rules/addon.md#addon-019--cloud-cvr-replay--t1-dependency` are stable link targets.

## Governance

- **GOV-1 — Atomic rules.** Every fact is one numbered rule with a source. Rules are
  the unit of citation, change, and conflict-checking — never paragraphs.
- **GOV-2 — The PR is the intake.** Every new PRD/spec must be checked against these
  rules before approval. A contradiction is a blocking conflict: the PRD changes, or
  the rule is superseded in the same PR with the change record in the PR description.
- **GOV-3 — Distillation.** An approved PRD/spec is not done until its decisions are
  distilled into rules here, citing the PRD as source.
- **GOV-4 — Supersede, never delete.** The newest approved product decision wins. The
  old rule stays as a tombstone (`superseded-by:` + struck-through title) so stale
  facts cannot be re-distilled. Rule IDs are never reused.
- **GOV-5 — Open questions live in the register.** A rule that is disputed, unverified,
  or in spec-vs-implementation conflict carries `refs: V-xx` pointing at
  [register.md](register.md). Agents and support must caveat any rule that carries an
  open register ref, and may assert uncaveated rules as fact.
- **GOV-6 — Chat is never canonical.** Canonical status requires a Jira ticket,
  Confluence page of record, PRD/TRD, shipped code, or an owner-verified golden QA
  entry checked into this repo.
- **GOV-7 — Golden QA is the regression suite.** Changes to rules must keep
  `golden-qa/` passing or update the expected answers in the same PR.

## Escalation

- Subscription platform, billing, entitlement, WSC, IAP/Stripe, plan/price setup → **Seth McBee**
- Services data and analysis requests → **Wenmin Liu**
- Product/app-experience decisions → owning PM thread + linked Jira/Confluence record (GOV-6)
