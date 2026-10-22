# Duplicate plans (DUP)

### DUP-001 — Duplicate account-level parents are an error state
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

Multiple active Cam Unlimited (`cam-unlimited`) records are a duplicate account-level parent condition, never additional camera coverage. Multiple account-level parents are not a normal add-on state.

### DUP-002 — The bound plan is authoritative
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)
- refs: V-22 (termination authority per provider undefined)

The currently bound account-level plan is authoritative for UI and management. Block add-on sales until the redundant parent is resolved; terminate the extra account-level plan (especially one with no devices connected).

### DUP-003 — Duplicates exist in production
- source: [T2 Duplicated Plans Analysis](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3183673447), [Reducing Duplicate Subscriptions](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3634299076), [SBIA-830](https://wyzelabs.atlassian.net/browse/SBIA-830)

Duplicate T2 states exist in production, including same-day duplicates and cross-channel overlap (IAP + Stripe). Never assume duplicates were auto-merged or that one provider canceled the other.

### DUP-004 — Duplicate-resolution handling order
- source: [KB page of record §Operational handling](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

(1) Enumerate all active Cam Unlimited records across Apple, Google, Stripe, Recharge, Recurly, and legacy sources, with provider, `plan_id`, status, renewal date, binding state. (2) Use the bound plan as authoritative. (3) Cancel the redundant plan through the provider that owns it — never promise automatic cancellation, refund, or proration without that provider's flow. (4) No new add-on sales until resolved; reconcile child add-ons against the authoritative parent.

### DUP-005 — Approved duplicate-plan customer copy
- source: [CAMPLUSN-946](https://wyzelabs.atlassian.net/browse/CAMPLUSN-946), [BAS-765](https://wyzelabs.atlassian.net/browse/BAS-765)

Use this exact wording. Two Cam Unlimited plans: "**Savings tip.** It looks like you have two Cam Unlimited. Cam Unlimited has no camera limit, so you can cancel one to save money." Cam Plus + Cam Unlimited: "**Savings tip.** Cam Unlimited plans already cover all your cameras, so you can cancel Cam Plus to save money." Do NOT reintroduce the older fixed-dollar savings or "coverage stays exactly the same" language.

### DUP-006 — Why a customer sees two plans (diagnosis)
- source: Golden QA v1 Q27/Q28 (owner-verified)

Two visible plans are usually two separate subscriptions (billing sources keep their own; one purchase doesn't cancel the other), sometimes a promotion stacked on an active plan (see PROMO-002 — coupon redemption doesn't check current subscription status), and occasionally benign: a canceled plan running out its paid period beside its replacement. Check each plan's billing source, status, and renewal/end date; two "renewing" plans = two active subscriptions, and the redundant one is canceled through the source that bills it.
