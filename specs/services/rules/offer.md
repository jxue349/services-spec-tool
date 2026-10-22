# Smart Offers (OFFER) & behavioral suppression (SUPP)

### OFFER-001 — Smart Offer is a separate, server-authoritative system
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832), [Smart Offer TRD](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4211277839)
- refs: V-26 (relationship to the churned-user promo catalog, PROMO-001)

Smart Offer is a distinct discount/re-engagement system, not the generic tier-upsell engine. v1 scope: free-user conversion + paid-user reactivation/retention; cross-tier upsell is a later phase.

### OFFER-002 — Post-churn (P0)
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832)
- refs: V-26

A free-tier user whose prior paid or free-trial subscription ended 15–30 days ago can receive an offer for the previous tier: 50% off monthly for 1 month OR 15% off annual for 1 year.

### OFFER-003 — Pre-churn (P1)
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832)

An offer may fire 10 days before expiry of the last active T1/T2/T3 plan.

### OFFER-004 — Long-free-user experiment
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832)

Activated users with >60 free days; 90/10 treatment/control split; ≤3 cameras → offer T1, >3 → offer T2; 50% monthly / 15% annual; 7-day offer window. Experimental parameters — revalidate before citing as permanent.

### OFFER-005 — Geo
- source: [Smart Offer TRD](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4211277839)

US/Canada only; EU users are never targeted.

### OFFER-006 — Active-subscription suppression
- source: [Smart Offer TRD](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4211277839)
- refs: V-09 (exception behavior is subtle; worked example pending)

Suppress Smart Offers for ANY active paid subscription or free trial (T1, T2, T3, HMS, CPT). Exception: a same-plan T1 quantity change — the offer stays usable in-window even while display is suppressed.

### OFFER-007 — Carry-over
- source: [Smart Offer TRD](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4211277839)

An offer follows a T1 quantity increase/decrease only within the first redeemed discount period and only for the same duration. A tier change or monthly↔annual change voids the offer.

### OFFER-008 — One visible offer
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832)

The client displays one offer at a time; the backend may hold multiple compatible assignments (e.g., monthly + annual variants). A conflicting offer never replaces a displayed offer until it expires.

### OFFER-009 — Server authority
- source: [Smart Offer TRD](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4211277839)

The client never decides eligibility or discount validity. The redemption gate rechecks assignment, active-subscription state, entitlement window, and target plan family; any failure falls back to standard-price checkout.

### OFFER-010 — No cross-tier inference
- source: [Smart Offer PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4019912832)

A Smart Offer assignment is never permission to switch tiers; the offer stays within its plan family.

### SUPP-001 — Suppression thresholds are configurable/experimental
- source: [Smart Upsell Suppression](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3237740551)
- refs: V-10

Smart Upsell Suppression thresholds are design-stage/configurable — never cite them as universal hard-coded entitlement rules.

### SUPP-002 — Cooldown
- source: [Smart Upsell Suppression](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3237740551)
- refs: V-10

When the suppression model crosses its configured threshold, suppress selected surfaces for a cooldown (design example: 14 days — an example, not policy).

### SUPP-003 — Inputs, surfaces, cohorts
- source: [Smart Upsell Suppression](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3237740551)

Inputs: dismissals, skipped banners, upsell interactions. Candidate surfaces: Home cards, Monitoring-tab banners, Timeline interstitials, Settings upsells. Candidate cohorts: long-time free users, high-exposure/no-action users, negative-feedback contributors.

### SUPP-004 — Validate before global rollout
- source: [Smart Upsell Suppression](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3237740551)

Validate suppression against conversion, retention, complaints, and satisfaction with control/test cohorts before any global application.
