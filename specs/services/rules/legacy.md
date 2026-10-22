# Legacy plans (LEGACY)

### LEGACY-001 — Four meanings of "legacy"
- source: [Platform API Product Doc](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3842441258), [WSC backfill result](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4087709914)

Never conflate: (a) legacy tiers / $0 plans (T0: CPL, Sprinkler Plus); (b) legacy names/service codes (`cam-ultimate`, `cam-plus-pro`); (c) legacy billing cohorts (Recurly, Recharge, pre-ITEMS Stripe); (d) legacy benefit assumptions.

### LEGACY-002 — CPL is not "lifetime"
- source: [CPL/Cam Unlimited stacking Teams discussion](https://teams.cloud.microsoft/l/message/19:f5750efd966a478c996379ceae46f84d@thread.v2/1760004727210?context=%7B%22contextType%22%3A%22chat%22%7D)
- refs: V-07 (policy page of record still missing)

Never describe CPL as a universal "lifetime" benefit — no official policy source establishes it.

### LEGACY-003 — Legacy-plan lookup order
- source: [KB page of record §8](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

(1) [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service) → (2) [Third-party Plan Code & Plan ID Mapping](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/2156331054) → (3) [Platform API Product Doc](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3842441258) → (4) WSC backfill/data-quality pages → (5) Jira change tickets for dates and migration behavior.

### LEGACY-004 — Never infer from a single label
- source: [KB page of record §4](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Never infer "free," "legacy," or "lifetime" from one label; resolve through the mapping tables.

### LEGACY-005 — CPL origin & modeling
- source: [KB page of record §A1](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040), [Cam Plus Lite FAQ](https://support.wyze.com/hc/en-us/articles/4415330946075-Cam-Plus-Lite-FAQ), Golden QA v1 Q20

CPL originated as a compatibility layer preserving 12-second videos + person detection for earlier cameras after the paywall change; the commercial model was pay-as-you-go (proposed by Dave, adopted by PM decision). The majority selected or retained **$0**; paying CPL customers average **~$1.50**. Existing T1 users were granted free CPL coverage across their cameras as a retention measure (layered on T1, not a new tier). Model CPL as a legacy compatibility + retention benefit: preserve plan identity, amount, source, and coverage; never infer a current paid T1 or a lifetime entitlement from CPL.
