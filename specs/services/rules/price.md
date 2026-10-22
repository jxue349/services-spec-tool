# Pricing, trials & promotions (PRICE / TRIAL / PROMO)

### PRICE-001 — Stripe source of truth
- source: [Stripe Billing SOP](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/4325113871)

The Stripe Billing SOP is the operational source of truth for approved Stripe SKUs, price IDs, currencies, and defunct-price handling.

### PRICE-002 — IAP source of truth
- source: [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990)

The IAP Governance page is the operational source of truth for native IAP and Stripe-IAP plan/price governance.

### PRICE-003 — Prices are never entitlement keys
- source: [KB page of record §9](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Never copy a customer-facing price into entitlement logic; price, currency, source, region, and legacy mapping are separate concerns.

### PRICE-004 — Price-change checklist
- source: [CHANGE-5169](https://wyzelabs.atlassian.net/browse/CHANGE-5169), [BCS-459](https://wyzelabs.atlassian.net/browse/BCS-459), [CAMPLUSN-930](https://wyzelabs.atlassian.net/browse/CAMPLUSN-930)

On any price/plan change check all four: the Jira change ticket, the Stripe/IAP mapping, the WSC plan mapping, and app/web display behavior.

### PRICE-005 — Current US list prices
- source: [Stripe Billing SOP](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/4325113871), [IAP Governance](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3063545990), [Service IAP](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/2383216678), [wyze.com compare page](https://www.wyze.com/pages/compare)

T1 Cam Plus: $2.99/mo or $29.99/yr per camera — IAP price-aligned with web (the current parity exception). T2 Cam Unlimited: web $9.99/mo or $99.99/yr vs IAP $12.99/mo or $129.99/yr. T3 Cam Unlimited Pro: web $19.99/mo or $199.99/yr vs IAP $25.99/mo or $259.99/yr. IAP is ~30% above web for both account-level plans (native-store fee model). CPT: $3.99/mo or $39.99/yr (verify device quantity/SKU). HMS: $4.99/mo or $49.99/yr. CPL: no single fixed price (pay-what-you-want legacy, account-specific). Apple/Google storefront prices vary by country/currency/tax; the platform price table is the final charged amount.

### PRICE-006 — Price history
- source: [Wyze Services: A Timeline of Breakthroughs](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/2055667851), [Important Cam Plus Annual Price Update](https://support.wyze.com/hc/en-us/articles/46048795912347), [Cam Plus Lite FAQ](https://support.wyze.com/hc/en-us/articles/4415330946075-Cam-Plus-Lite-FAQ)

Cam Plus monthly: $1.99 → $2.99 effective 2023-06-20 (announced 2023-05-17). Cam Plus annual: $19.99 → $29.99 per camera/year effective 2026-03-02. The 2026 annual increase did NOT apply to CPL (grandfathered, account-specific amount). T2 $9.99/$99.99 is a current catalog price, not a change event. No verified price-increase event for CPT or HMS in the current source set.

### PRICE-007 — Pricing interpretation
- source: [KB page of record §Pricing interpretation rules](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Treat `web_price`, native IAP price, legacy amount, and promotional/Smart-Offer price as separate values — a discounted checkout never overwrites catalog price. For Apple/Google, resolve the platform product ID first, then read the localized price; `plan_id` is never a dollar amount. For CPL, preserve the account's historical amount and source — never normalize to $0 or the current Cam Plus price. Never assume IAP/web parity for T2/T3 (T1 is the current exception). Price investigations capture: provider, currency, tax, quantity, old/new price, effective date, renewal date, grandfathering, and the linked change/FAQ ticket.

### PRICE-008 — Add-on prices
- source: [KB page of record §Add-on pricing](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

US list, P0 monthly-only, per device: Pro AI $4.99/mo, Cloud 60 $2.99/mo, Cloud CVR $4.99/mo. Platform-localized Apple/Google prices can differ.

### PRICE-009 — Three purchase channels, three prices
- source: Golden QA v1 Q31 (owner-verified), [Stripe IAP relaunch pricing](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4071915551)

Native IAP = Apple/Google storefront price, renews through the store. Stripe IAP (starts in-app, checks out through Stripe) = **15% off the standard IAP price for the first year, then renews at the standard IAP price**. Web Stripe = website price, renews at web price unless a promotion or price change applies. A promotional checkout amount never overwrites the catalog price (PRICE-007).

## Trials (TRIAL)

### TRIAL-001 — Subscription trials are opt-out introductory offers
- source: Golden QA v1 Q18/Q30 (owner-verified)

Subscription free trials are opt-out IAP introductory offers (user commits a payment method; auto-renews after the trial), one month on Apple and Google.

### TRIAL-002 — Trial eligibility differs by store
- source: Golden QA v1 Q18 (owner-verified)
- refs: V-27 (Google upgrade target tier wording)

On iOS all subscription tiers share one subscription group, so a T1→T2 upgrade is NOT a new subscription and earns no new trial. On Google Play, a tier upgrade counts as a new subscriber to the target plan and grants a 30-day free trial.

### TRIAL-003 — Web trials
- source: Golden QA v1 Q18 (owner-verified)

Originally no trials for website purchases; since the Stripe migration the website offers a 30-day trial. The opt-in T3 trial experiment (Jeremy) has ended — do not cite it as current.

## Promotions (PROMO)

### PROMO-001 — Churned-user re-engagement offers
- source: Golden QA v1 Q30 (owner-verified)
- refs: V-26 (relationship to the Smart Offer system)

Current offers: 50% off Cam Plus for 3 months; $5 off Cam Plus for the next year (changes to $10 off after the 3.26 release in November 2026); 50% off Cam Unlimited for 3 months; $10 off Cam Unlimited for the next year.

### PROMO-002 — Coupon-redemption gap
- source: Golden QA v1 Q28 (owner-verified)

Marketing promotions redeemed through the website do NOT check the user's current subscription status, so a redeemed Cam Unlimited promo can stack on an existing plan — a known source of Cam Plus + Cam Unlimited coexistence (see DUP-006).
