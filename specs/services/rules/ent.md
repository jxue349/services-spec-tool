# Entitlement data model (ENT)

Conceptual shape (reasoning aid; the [Platform API Product Doc](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3842441258) defines the concrete contract):

```text
Account
├── Parent subscription(s): source, plan_id/plan_code, tier, status, dates, logical quantity/coverage
└── Child add-on subscription(s): add_on_id/service code, parent_subscription_uuid,
    prerequisites, device_id (when bound), model eligibility, child status + lifecycle dates
```

### ENT-001 — WSC is the entitlement layer
- source: [WSC as the brain of our apps](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4075192341)

WSC is the platform-level entitlement layer and reconciliation point. Never treat Stripe, Apple, or Google alone as the complete entitlement model.

### ENT-002 — Subscription record ≠ bound camera
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

A parent plan can cover an account while child add-ons carry their own subscription, prerequisite, device, and binding state.

### ENT-003 — Parent/child linkage
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), [BCS-424](https://wyzelabs.atlassian.net/browse/BCS-424)

Child add-ons link to their parent via `parent_subscription_uuid`. Identify records by internal `subscription_uuid`, never by provider IDs.

### ENT-004 — Null `plan_code` can be valid
- source: [BCS-410](https://wyzelabs.atlassian.net/browse/BCS-410), [WSC Data Required Field Validation Result](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4164517898)

`plan_code` can legitimately be null in historical/source-specific records (Stripe pre-ITEMS, Recharge without ITEMS). Never invalidate a record for null `plan_code`; recover via historical mapping, invoice items, or `external_variant_id`.

### ENT-005 — Unlimited plans use a normalized quantity
- source: [Platform API Product Doc](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3842441258)

Unlimited plans (T2/T3) are represented by a special normalized `subscription_quantity`, never a literal camera count. Never model them as one subscription per camera.

### ENT-006 — `TERMINAL` is a valid WSC status
- source: [BCS-436](https://wyzelabs.atlassian.net/browse/BCS-436)

`TERMINAL` exists in WSC (added for Membership synchronization). Interpret `status` together with `source` and provider event history.

### ENT-007 — Active-but-unbound ("floating") add-ons
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), [SVCWEB-5860](https://wyzelabs.atlassian.net/browse/SVCWEB-5860)
- refs: V-25 (renewal/billing treatment of floating add-ons is unreconciled)

A child add-on can be active with no `device_id` ("floating"). Unbound ≠ canceled; treat it as an active unused entitlement, not a free license.

### ENT-008 — ~~Auto-bind of unused add-on licenses~~
- superseded-by: ENT-011

Former rule claiming an eligible unused add-on license is automatically bound when a device is bound to the parent. Replaced by ENT-011.

### ENT-009 — Sharing follows the parent
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

Add-on sharing behavior follows the parent plan's sharing rules; never assume independent sharing semantics for a child.

### ENT-010 — Identify plans by `plan_id`, not display text
- source: [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service)

Use the canonical `plan_id` mapping, never display text (T3 displays "Cam Unlimited Pro" while carrying `cam-ultimate`).

### ENT-011 — No universal self-serve rebind (P0)
- source: [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860), [PRD - Wyze Add-on and Services Page](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4200628289)

A floating add-on is not a generic transferable license: recovery/rebinding must use the supported parent/device flow or a support/backend path to an eligible device. Self-service rebinding is specified as P1, not P0. (Supersedes ENT-008.)
