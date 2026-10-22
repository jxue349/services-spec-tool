# Troubleshooting playbooks (TSHOOT)

### TSHOOT-001 — "Paid but plan missing"
- source: [BCS-410](https://wyzelabs.atlassian.net/browse/BCS-410), [BCS-420](https://wyzelabs.atlassian.net/browse/BCS-420), [CLOUD-3255](https://wyzelabs.atlassian.net/browse/CLOUD-3255)

(1) Identify billing source + external customer/subscription IDs → (2) find the WSC record by customer identity → (3) check `subscription_uuid`, source, status, plan ID, user mapping → (4) null `plan_code` → recover per ENT-004 before classifying invalid → (5) check Stripe/Membership/WSC divergence or account-identity mismatch.

### TSHOOT-002 — "Add-on paid but unavailable"
- source: [BCS-424](https://wyzelabs.atlassian.net/browse/BCS-424), [PRD: Subscription Add-On System](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3384737860)

(1) Parent + child both present → (2) child not canceled/expired/terminal → (3) prerequisites + model support → (4) active-but-unbound / recovery expected (ENT-011) → (5) attached to the correct parent UUID.

### TSHOOT-003 — "Wrong plan or purchase path shown"
- source: [BCS-137](https://wyzelabs.atlassian.net/browse/BCS-137), [BUG-67249](https://wyzelabs.atlassian.net/browse/BUG-67249), [BUG-68020](https://wyzelabs.atlassian.net/browse/BUG-68020)

(1) Separate display name from service code (esp. T3) → (2) determine web/Apple/Google management → (3) route web changes to the web flow → (4) check legacy event tabs + entitlement tags (Pro AI / video-search entrances) → (5) verify app/web/backend share the same plan-mapping version.

### TSHOOT-004 — "Upsell missing or wrong"
- source: [KB page of record §Upsell troubleshooting](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Inspect in order: (1) persona/account state (free, T1/T2/T3, HMS, CPT, trial, churned) → (2) camera inventory (count, Bird-only, compatibility, shared devices) → (3) current coverage (cross-platform T1/T2/T3/CPU locks; CPT/HMS non-locking; unassigned seats) → (4) add-on state (model support, prerequisite, owned, bundled, gating per ADDON-015/016) → (5) offer state (assignment, geo, suppression, plan-family/duration match, window) → (6) surface suppression (Bird Watch restrictions, suppression cooldown, holdout).

### TSHOOT-005 — "Plan missing in app": self-service vs support split
- source: Golden QA v1 Q29 (owner-verified)

Purchase tied to a different Wyze account (incl. deleted/recreated) or an Apple/Google purchase that never linked to the Wyze account (store account, private-relay email) → **customer support**. Subscription active but not assigned to all cameras → user edits covered cameras on the service page. Plans not visible on the service page at all → per-camera **service reset**.
