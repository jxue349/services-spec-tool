# Verification & Conflict Register

Open items block uncaveated support use of the rules they reference (README GOV-5). Resolved items are kept for history.

## Open

### V-04 — Edit-screen upgrade path: spec vs implementation 🔴
- rules: PICKER-006

Product rule says the over-cap editor CTA is "Upgrade to Cam Unlimited"; shipped code has `isUpgradePathEnabled = false`. Code review shows the path fully built behind a LOCAL compile-time switch (incl. the CU-price CTA), so it is parked, not abandoned — but the switch cannot be flipped remotely.
**Next:** PM + iOS (Wenjie Xu authored the file) decide: enable in a release, or formally defer; record the decision ticket here.

### V-06 — CPT + HMS coexistence edge cases ⚠️
- rules: MON-001

The prohibition is stated in the CPT overview, but migration cohorts complicate it.
**Next:** confirm with monitoring/HMS owners whether any legacy account legitimately holds both; document cohort exceptions.

### V-07 — CPL "lifetime" policy gap ⚠️
- rules: LEGACY-002, LEGACY-005

No official policy source establishes CPL as lifetime (or not); support answers rest on an absence of documentation.
**Next:** Product publishes an explicit CPL benefit policy on a page of record.

### V-08 — HMS gifted Cam Plus license scope ⚠️
- rules: FEAT-006

Quantity (one license? account-wide?), eligibility conditions, and behavior on HMS cancellation are unconfirmed.
**Next:** confirm via HMS-973 / SVCWEB-5579 owners.

### V-09 — Smart Offer T1 quantity-change exception ⚠️
- rules: OFFER-006

Usable-while-display-suppressed is subtle and easy to mis-implement or mis-explain.
**Next:** walk the TRD flow with the Smart Offer owner; add a worked example to golden-qa.

### V-10 — Suppression thresholds experimental ⚠️
- rules: SUPP-001, SUPP-002

Design-stage/configurable values (incl. the 14-day cooldown example), not shipped policy.
**Next:** confirm current experiment state and config values.

### V-12 — Platform coverage gap (iOS-only evidence) ⚠️
- rules: PICKER-001…007, SURF-004…008

Picker/editor/surface rules are evidenced from iOS code only; Android (BAS-765, BUG-67570 suggest parallel work) and web are unconfirmed.
**Next:** verify Android + web implementations; record divergences as platform-specific rules.

### V-13 — T3 trial plan ID unrecorded ⚠️
- rules: TIER-003

**Next:** pull the exact trial plan ID from Membership Plan & Service and record it in TIER-003.

### V-14 — Camera-count definitions ⚠️
- rules: UPSELL-001, PICKER-002, OFFER-004, SURF-003

The 3/4-camera boundary appears with different count definitions (owned vs effective covered vs unspecified).
**Next:** record the canonical count definition on each rule.

### V-18 — Bird Watch price (pre-launch) 🔴
- rules: BW-002

$5.99/$59.99 (integration config, Project Peek) vs $6.99/$69.99 (Paywall PRD IAP table — newest artifact) vs a $5.99/$49.99 variant in Project Peek open items. "Pricing final confirmation" is an explicit pre-launch decision; launch target Nov 2026.
**Next:** owners Sunny Wu / Mengting Hu / Finance record the final catalog price; supersede the losers.

### V-20 — Wrong citation on the Confluence page ⚠️
- rules: FEAT-009

The page's "Cam Base Free / Window Cam implementation draft" evidence link points at the Smart Offer TRD URL.
**Next:** fix the link on the page of record.

### V-21 — Onboarding ~40% conversion unversioned ⚠️
- rules: SURF-002

The metric lacks a versioned measurement window/denominator.
**Next:** version with Services data (Wenmin Liu intake).

### V-22 — Duplicate-plan termination authority ⚠️
- rules: DUP-002, DUP-004

"Terminate the redundant plan" vs "cancel through the owning provider": WSC cannot cancel store subscriptions, so who executes termination per provider (user via store, support, backend) is undefined.
**Next:** define the operational owner per provider.

### V-23 — T1 quantity SKUs: purchasable vs legacy ⚠️
- rules: PICKER-001, MAP-002, MAP-003

iOS code states Cam Plus IAP SKUs exist only for 1/2/3 cameras; the catalog carries 1–9 + a 99 "unlimited bucket" — presumed legacy, mapping-only.
**Next:** confirm in App Store / Play Console that 4–9/99 are retired from sale; mark them "legacy, mapping-only" in MAP-002/003.

### V-24 — Bird Watch commerce platform & service-code spelling 🔴
- rules: BW-001, BW-006, BW-009

Paywall PRD makes the in-app IAP the only acquisition surface at launch ("no web purchase page"), while a Bird Watch PRD comment (Sunny Wu) says launch "only in Stripe rather than Stripe + IAPs." Service-code spelling also differs: `bird_watch` (PRD config) vs `bird-watch` (integration page).
**Next:** confirm launch commerce platform and canonical spelling with Sunny Wu before launch; align BW rules and the catalog.

### V-25 — Floating add-on renewal treatment 🔴
- rules: ENT-007, ADDON-012

The Add-On PRD describes the unbound subscription as remaining in `RENEW`; the [Add-on Management High-Level P1](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4279107614) doc says to preserve remaining paid value and prevent unintended renewal while unresolved. Not a single settled rule.
**Next:** reconcile with Seth McBee; record the winning billing treatment and supersede the other.

### V-26 — Promo catalog vs Smart Offer 🔴
- rules: PROMO-001, OFFER-001, OFFER-002, OFFER-004

Two re-engagement discount systems are described: Smart Offer PRD/TRD (50% monthly ×1 month / 15% annual, server-authoritative) vs the current promo catalog (50% ×3 months, $5/$10 off next year). Separate systems, or did the promo catalog supersede Smart Offer v1 parameters? Note the $5→$10 change rides the 3.26 release (Nov 2026).
**Next:** confirm with the Smart Offer owner; either scope OFFER to the Smart Offer system and PROMO to campaign offers, or supersede.

### V-27 — Q18 Google trial tier wording ⚠️
- rules: TRIAL-002

Golden QA Q18 says a Google Play upgrade from Cam Plus counts as a new subscriber to "Cam Unlimited **Pro**" — suspected typo for Cam Unlimited.
**Next:** Jing confirms the intended tier; fix the QA text and TRIAL-002 together.

## Resolved

- **V-01** (2026-10-06) — "Cam Unlimited Light": owner decision — never a Wyze product; TIER-005 superseded; occurrences are source errors.
- **V-02** (2026-10-07) — T1 includes **Package detection** (plus garage-door detection and sound alerts per the live service-plans page); the Confluence tier table omitting it was the error. → FEAT-001.
- **V-03** (2026-10-06) — T1/T2/T3 feature enumeration published as the canonical tier table. → FEAT-001…003.
- **V-05** (2026-10-06) — Pro AI price confirmed $4.99/mo/device (`feature-pro-ai-monthly`). → ADDON-005.
- **V-11** (2026-10-06) — Auto-bind superseded: no universal self-serve rebind in P0. → ENT-011.
- **V-15** (2026-10-22) — ADDON-008 superseded: eligibility/ordering server-driven via Stripe catalog (BCS-498); gating = 3.23 full-release switch + Firebase remote config. → ADDON-015/016.
- **V-16** (2026-10-07) — T3 $3.99/$39.99 cell was a copy error; $19.99/$199.99 confirmed on live wyze.com pages. → PRICE-005, MAP-006.
- **V-17** — folded into open verification of MAP-003 (Google T2 IDs `1234567890123/4` look like placeholders; confirm real Play Console IDs). Still to confirm — tracked under V-23's console check.
- **V-19** (2026-10-07) — Google/Stripe downgrade: current-vs-target split per Unified Billing LESS flows (CAMPLUSN-922, SVCWEB-5933); Apple already deferred. → LIFE-015.
