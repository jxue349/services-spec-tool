# IAP surfaces & merchandising (SURF)

### SURF-001 — Generic IAP page
- source: [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990), [Service IAP](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/2383216678)

The generic IAP page presents the three canonical security plans — T1, T2, T3; the shown/selected option depends on camera ownership, coverage, and subscription state. It is only one entry point among contextual upsells.

### SURF-002 — Onboarding conversion metric
- source: [KB page of record §Conversion rules](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)
- refs: V-21 (measurement window/denominator unversioned)

Onboarding IAP conversion is reported at ~40% of users who activate a camera; onboarding routes primarily to T1 or T2 by camera count. Preserve as a product metric until versioned.

### SURF-003 — Camera-count authority
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift), [Membership v2 notes](https://github.com/wyzelabs-inc/wyze-repo-index/blob/main/features/subscription/WyzeMembershipManagementService.md)

Never choose a tier from newly selected camera rows alone — resolve effective camera coverage and existing T1/T2/T3 bindings first, then apply the threshold and the IAP product/quantity flow.

### SURF-004 — Free/T1/T2 surface rules
- source: [KB page of record §Free-user and T1/T2 surfaces](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Event-detail player IAP button shows for free users ONLY — never to a paid T1/T2 user just for opening event detail. T1 binding-state flows use the appropriate IAP flow emphasizing cloud storage/recording value. Person-detection filter icon and the five-minute cooldown message show generic upsells (resolve tier + coverage before choosing the destination; the cooldown surface is never T3- or add-on-specific). Friendly Faces on Monitoring and Smart Mode are T2-specific surfaces. Home-page and plugin-page "Get Cam Plus" CTAs are T1 CTAs resolved by owned-camera count and existing coverage.

### SURF-005 — T3/add-on surfaces use their own value propositions
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264), [KB page of record §T3 surfaces](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Never reduce T3 surfaces to the generic plan page: Wyze Stories (current name; legacy aliases only for analytics/migration), Video Search icon (T3), DA icon / Event Calendar (T3), Cloud 60 embedded upsell, and Wyze Intelligent page flows (Stories → T3+Cloud 60; Pro AI/Video Search → T3+Pro AI; Cloud 60 → Cloud 60+T3). Destination flows preserve the parent/add-on relationship.

### SURF-006 — Merchandising guardrails
- source: [KB page of record §IAP merchandising guardrails](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

(1) Resolve account tier, effective coverage, binding state, device eligibility, and existing add-ons BEFORE displaying an upsell. (2) Keep generic recommendations separate from contextual/unique value propositions. (3) Never show Pro AI as standalone to a T3 user. (4) Never let a legacy event entry route a T1/T2 user into a T3-only or wrong-provider flow — entitlement tags determine destination. (5) Log entry point, parent tier, camera count, binding state, message family, destination `plan_id`, and resulting purchase.

### SURF-007 — Service-page card merging & channel pills
- source: Golden QA v1 Q9 (owner-verified)

Subscriptions of the same tier merge into ONE card (e.g., Cam Plus licenses from multiple platforms), with purchase platforms shown as pills under the plan name and one management button; expiration shows inline on manage. A parent billed through a non-current platform: in-app editing disabled, show "expires at {date}", route Update-payment/management to the owning store or web channel. A parent billed through the current platform: full in-app manage (cancel/upgrade/downgrade + camera coverage).

### SURF-008 — Pro-AI page "Add Cam Plus" routing
- source: Golden QA v1 Q12 (owner-verified)

If the user has an available/floating T1 license, route to **binding** (binding takes priority even when there is also an empty device); only with no floating T1 route to purchase.
