# Add-ons & device binding (ADDON)

### ADDON-001 — The three Security Plan add-ons
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), [Add-on Matrix](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3978428449)

The current Security Plan add-ons are **Pro AI, Cloud 60, and Cloud CVR**. Bird Watch is a separate standalone subscription, NOT an add-on ([bw.md](bw.md)). Add-ons are modeled via parent-plan eligibility, prerequisites, tier eligibility, and device/model support — never a flat "has add-on" flag.

### ADDON-002 — Eligibility check order
- source: [KB page of record §Eligibility checklist](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

(1) Parent plan + source → (2) parent lifecycle state → (3) prerequisite → (4) tier + camera model support → (5) account-level vs device-bound → (6) `device_id`, binding history, active-but-unbound state → (7) correct plan-management surface for the billing source.

### ADDON-003 — Bundled means never re-sold
- source: [Membership v2 notes](https://github.com/wyzelabs-inc/wyze-repo-index/blob/main/features/subscription/WyzeMembershipManagementService.md)

An add-on already included in the parent tier is bundled — never sold again to that user.

### ADDON-004 — Pro AI tier rules
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264)

Pro AI is a per-device add-on for T1/T2; its feature bundle (Wyze Stories, Smart Notifications, AI Video Search on selected cameras) is included in T3 — never sold separately to T3 users. Free-tier users are routed to Cam Plus first; Pro AI is never standalone.

### ADDON-005 — Pro AI identity & price
- source: [KB page of record §Add-on pricing](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Service code `feature-pro-ai`, plan `feature-pro-ai-monthly`, **$4.99/month/device**, monthly-only in P0. T3/Cam Unlimited Pro is not the same price or identity.

### ADDON-006 — No duplicate purchase
- source: [BUG-67452](https://wyzelabs.atlassian.net/browse/BUG-67452), [BCS-491](https://wyzelabs.atlassian.net/browse/BCS-491)

A camera that already has an add-on must not be offered repurchase of the same add-on.

### ADDON-007 — "Floating" terminology
- source: [SVCWEB-5860](https://wyzelabs.atlassian.net/browse/SVCWEB-5860)

Internal "floating" = active-but-unbound. Customer-facing copy uses clearer language, e.g. **"Unused Cam Plus"** — never "floating".

### ADDON-008 — ~~Fixed display order + Redis allowlist~~
- superseded-by: ADDON-015, ADDON-016

Former rule: recommendation order fixed (Pro AI → Cloud CVR → Cloud 60) and gated by a Redis allowlist with a Cloud 60 bypass. Replaced: ordering/price come from the Stripe catalog, gating from the app-version switch + Firebase remote config.

### ADDON-009 — Reactivation action reflects true state
- source: [SVCWEB-5969](https://wyzelabs.atlassian.net/browse/SVCWEB-5969)

After canceling an add-on, the reactivation action must reflect true entitlement/eligibility state — a missing "reactivate" is a state mismatch, not lost entitlement.

### ADDON-010 — Cloud CVR identity & limits
- source: [KB page of record §Current add-on rules](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Service code `feature-cloud-cvr`, plan `feature-cloud-cvr-monthly`, **$4.99/month/device**. **NOT included in T3** — separate purchase required. **Maximum ONE Cloud CVR add-on per user/account**; suppress duplicate-purchase paths once one is active or owned.

### ADDON-011 — Cloud 60 identity
- source: [Final PRD: Cloud 60 Add-on](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4141547558), [Service Plans comparison](https://www.wyze.com/pages/service-plans)

Service code `feature-cloud-60`, plan `feature-cloud-60-monthly`, **$2.99/month/device**; a separate per-device child subscription with its own binding state, attached to the parent camera/service subscription. Sellable to T1/T2; **already included with Cam Unlimited Pro** — never sell it to a T3 user (ADDON-003).

### ADDON-012 — Device binding & movement
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), [PRD - Wyze Add-on and Services Page](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4200628289), [Final PRD: Cloud 60 Add-on](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4141547558)
- refs: V-25

A user CANNOT freely move an active add-on from camera A to camera B via a generic self-serve flow. Standalone move = cancel/re-purchase (direct rebind is P1). A **T1 parent-license move carries child add-ons atomically** — move the parent through the supported flow (the Edit Camera button), never the child first. Camera deleted/unbound → the child goes floating (ENT-007); recovery is support/backend to an eligible device. The destination device must have an eligible parent plan, supported model/firmware, valid ownership, non-terminal state, and no conflicting duplicate. Upgrade to T3 cancels the redundant Pro AI child (billing treatment provider-specific — never promise a universal refund). Do not generalize Pro AI's upgrade behavior to other SKUs.

### ADDON-013 — Parent lifecycle gating
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), Golden QA v1 Q1 (owner-verified)

An add-on cannot be purchased/attached to an expired or about-to-expire parent. Canceling the parent → add-ons do not renew (expiration alignment per LIFE-014). Parent in grace period → do nothing; the platform's dunning handles the parent, and if retries fail and it expires, LIFE-014 applies. A same-platform downgrade or quantity reduction does NOT trigger terminal handling — use the platform's native change behavior.

### ADDON-014 — Cross-platform add-on purchase routes to web
- source: Golden QA v1 Q2 (owner-verified)

When selected cameras fall under parents on different platforms (e.g., one IAP + one Stripe Cam Plus), the app routes the customer to the website to complete the add-on purchase. The website processes the purchases as separate API calls per parent; the frontend presents it as one seamless transaction.

### ADDON-015 — App-version gating
- source: Golden QA v1 Q4/Q6 (owner-verified)

Pro AI and Cloud CVR purchase entry points show only on app **≥3.23** (released 2026-09-30) AND with the full-release switch on; switch off → Pro AI/Cloud CVR fall back to whitelist-based display. App <3.23, web requests, or unparseable app version → show **Cloud 60 only**. Cloud 60 itself is gated by a **Firebase remote-config feature flag**.

### ADDON-016 — Eligibility is server-driven
- source: [BCS-498](https://wyzelabs.atlassian.net/browse/BCS-498), [Add-on Matrix](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3978428449), Golden QA v1 Q5

Never hard-code eligibility in the app. Recommended-add-on logic checks device model, eligible tier, and a parent subscription in `RENEW`; removes add-ons already owned; then uses the **Stripe catalog for price AND ordering**. Model support comes from the maintained add-on/device matrix. (Supersedes ADDON-008.)

### ADDON-017 — No add-on free trials
- source: Golden QA v1 Q17 (owner-verified)

Add-ons have no free trials. A parent plan still in its free trial cannot purchase add-ons; add-ons become purchasable once the parent enters its paid period.

### ADDON-018 — Add-on model support
- source: Golden QA v1 Q14–Q16/Q6 (owner-verified), [BUG-68300](https://wyzelabs.atlassian.net/browse/BUG-68300), [Add-on Matrix](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3978428449)

Pro AI and Cloud 60: all camera models EXCEPT Cam V1, Window Bird Cam, WCO v1, WCO v2, and Doorbell v1. Cloud CVR: Cam V3, Pan V3, and Cam V4 (as of 2026-10-22). Cloud CVR also enforces a per-model minimum firmware from configuration — never invent a universal firmware cutoff. The matrix remains authoritative for changes.

### ADDON-019 — Cloud CVR replay & T1 dependency
- source: Golden QA v1 Q8/Q10 (owner-verified)

Cloud CVR records continuously with **7-day replay/retention**. Recording requires BOTH an active T1 association on the camera AND the Cloud CVR add-on; when T1 is moved away, the timeline shows a gap for the uncovered period — never continuous recording.
