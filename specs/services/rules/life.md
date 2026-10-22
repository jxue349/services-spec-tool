# Lifecycle, channels & billing (LIFE)

### LIFE-001 — Billing sources
- source: [Stripe Billing SOP](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/4325113871), [Subscription Data Ownership](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3644981487)

Billing sources: Stripe, Apple IAP, Google IAP, Recharge, Recurly (plus Amazon-channel and auto-activation bundles — LIFE-009). The source determines where billing changes happen; WSC/Membership reconciles the resulting entitlement.

### LIFE-002 — Canceling a parent ≠ unbinding a child
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

Relationship/binding changes and subscription cancellation/termination are separate operations.

### LIFE-003 — Web-managed plans change on the web
- source: [BUG-67249](https://wyzelabs.atlassian.net/browse/BUG-67249)

iOS routes web-managed T1/T2/T3 plan changes to the web manage-plan flow, never native IAP.

### LIFE-004 — Proration is source/flow-dependent
- source: [Add-On Billing Alignment — Stress Test Cases](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3990421509)

Proration and consolidated billing vary by source and flow; never assume universal consolidation.

### LIFE-005 — Don't trust top-level nulls in historical data
- source: [WSC Data Required Field Validation Result](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4164517898)

Some provider/source combinations recover key values from invoice items or historical mappings.

### LIFE-006 — UI labels are not entitlement states
- source: [BCS-436](https://wyzelabs.atlassian.net/browse/BCS-436), [Subscription Entitlement Issues](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4319903759)

States in use: renewing/active, cancellation/expiration, grace period, terminal — interpreted with source + event history, never from a button label.

### LIFE-007 — Multiple Cam Plus subscriptions can coexist
- source: [KB page of record §Multiple Cam Plus](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

One account can hold multiple Cam Plus subscriptions at once (e.g., IAP + website + legacy Recharge combined checkout). They are separate provider subscriptions even in the same family. A website/Stripe migration does NOT automatically cancel an IAP subscription.

### LIFE-008 — Website management target is Stripe
- source: [Stripe Billing SOP](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/4325113871), [Subscription Data Ownership](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3644981487)

Recharge records are legacy source records during migration; post-migration website billing changes belong in Stripe, with WSC/Membership as the entitlement layer.

### LIFE-009 — Management channel rules
- source: [KB page of record §channel table](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040), [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990)

Apple/Google IAP → managed in app + store flow; changing the website plan does not cancel IAP. Website/Stripe → website service page; cannot silently cancel a store subscription. Legacy combined checkout/Recharge → migration-aware website or support flow; verify migrated Stripe and legacy Recharge records separately. Auto-activation bundle → detected from the activated device MAC; billing address and renewal cycle established during onboarding; not a normal renewing subscription at hardware purchase. Amazon → managed only in the Amazon account, not via wyze.com or the app.

### LIFE-010 — Web merge never cancels IAP
- source: [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990), [Subscription Data Ownership](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3644981487)

The website may prorate eligible IAP coverage and merge plans into a website plan, but consolidation does not cancel the original IAP subscriptions — the user must manually cancel each store subscription or they keep paying twice. Represent every provider subscription separately (provider, `plan_id`, status, dates, management channel); a merged website plan is never evidence the IAP source was terminated.

### LIFE-011 — Platform history (support context)
- source: [KB page of record §platform history](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

(1) Original website subscriptions on Recurly; (2) Apple/Google IAP added ~March 2021; (3) combined D2C checkout (login-required, later guest-checkout email matching); (4) Recharge/Shopify adopted for combined checkout — now stopped, records remain relevant; (5) auto-activation bundles via vendor-recorded MAC; (6) Amazon-channel subscriptions. Combined-checkout records are not interchangeable with IAP or current Stripe records.

### LIFE-012 — Combined-checkout complaint patterns
- source: [KB page of record §complaint patterns](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Email mismatch → search by checkout email, order, provider record, device/account IDs before declaring a license missing. Unrecognized renewal charges → identify provider + renewal record before treating as unauthorized/duplicate. Management-channel confusion → state the owning channel explicitly; separate billing ownership from entitlement visibility.

### LIFE-013 — Service page states the management channel
- source: [What's New: Managing Your Wyze Security Plan on the Web](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4264427570), [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990)

The service page shows detected plans with each plan's management channel. A website plan viewed in the app shows the in-app message directing management to the website; never present website management as an IAP action.

### LIFE-014 — WSC date alignment on parent cancellation
- source: [SVCWEB-5716](https://wyzelabs.atlassian.net/browse/SVCWEB-5716), [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

Compare parent `subscription_expired_date` with child expirations. Add-on ends later → extend the parent's entitlement FREE to the add-on's expiration (no parent renewal, invoice, or new paid term). Parent ends later → the add-on expires on its own date and is NOT renewed or extended. Both end together → both expire, no extension. Persist and display parent and child dates independently; never infer that a parent extension extends the add-on or that an add-on expiry cancels the parent.

### LIFE-015 — Plan change rules by platform (current vs target)
- source: [Unified Billing Change Management: LESS flows](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4282613763), [MORE flows](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4311220238), [EOC Downgrade Proposal](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4268228641), [Subscription Change Rules by Platform](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4242997269), [CAMPLUSN-922](https://wyzelabs.atlassian.net/browse/CAMPLUSN-922), [SVCWEB-5933](https://wyzelabs.atlassian.net/browse/SVCWEB-5933)

Purchase platform = source of truth; never one universal Wyze rule. Voluntary cancellation ≠ refund — the subscription stays active through `subscription_expired_date` (store/legal refund exceptions apply separately). **Apple:** upgrade immediate (remaining value carried forward — never promise a refund); downgrade natively deferred to next renewal (already the target). **Google CURRENT:** upgrade immediate with Google's proration; downgrade currently applies immediately with proration in production. **Google TARGET (approved, in progress):** `ReplacementMode.DEFERRED` for tier and billing-frequency downgrades; quantity decreases via `subscriptions.cancel` (not revoke) running to natural expiration — CAMPLUSN-922. **Web/Stripe CURRENT:** upgrade immediate (unused value credited, new plan charged now); downgrade currently an immediate prorated credit. **Web/Stripe TARGET (approved, in progress):** all LESS changes (tier, quantity, frequency) deferred to period_end via Stripe Subscription Schedules — SVCWEB-5933. Until the LESS work ships, support answers use CURRENT behavior. Always show effective + expiration dates and reconcile the store event with WSC/Membership before changing entitlements.

### LIFE-016 — Charge timing and amount
- source: [KB page of record §Charge timing](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Use the new plan's current storefront or web price and the platform's active proration/replacement mode. Never compute a universal charge from internal `plan_id` (stores localize prices; proration may be cash, credit, or service time). The net-proration formula `remaining_value = old_price × unused_days ÷ term_days; charge_today = new_price − remaining_value` is a model only — the provider billing event and displayed expiration date are the final source for amount and timing.

### LIFE-017 — Reactivation
- source: Golden QA v1 Q13 (owner-verified)

A child add-on canceled at period end keeps access through its paid term (canceling the child never cancels the parent). A non-expired add-on can be reactivated; an expired one must be repurchased. A non-expired parent can be reactivated, but the Reactivate button appears only within **31 days before expiration** (Manage becomes Reactivate in that window — reactivation is then the only action). An expired parent must be repurchased.

### LIFE-018 — Involuntary churn / dunning
- source: Golden QA v1 Q19 (owner-verified)

Apple and Google handle retries and user notification natively; Wyze only configures the grace period per plan — currently **30 days** on all three channels. Web/Stripe billing also uses a 30-day grace period, with **Butter** used to improve Stripe retry success.

### LIFE-019 — No cross-store management
- source: Golden QA v1 Q11 (owner-verified), [Unified Billing: MORE flows](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4311220238)

A subscription bought in one app store cannot be canceled/upgraded/downgraded/crossgraded from the other platform's app. Store subscriptions are manageable directly in the App Store / Play Store without the Wyze app. The website can cancel **Google Play** subscriptions (Google exposes APIs) but NOT Apple App Store subscriptions.
