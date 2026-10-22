# Plan recommendation — Service Page v2 (UPSELL)

### UPSELL-001 — Free-user recommendation threshold
- source: [Membership v2 notes](https://github.com/wyzelabs-inc/wyze-repo-index/blob/main/features/subscription/WyzeMembershipManagementService.md), [FreeUserUpsellView.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/States/FreeUserUpsellView.swift)
- refs: V-14 (camera-count definition per rule)

`camera_threshold = 3`: fewer than 4 owned cameras → recommend T1 (Cam Plus); 4 or more → recommend T2 (Cam Unlimited).

### UPSELL-002 — Matched layout (≥4 cameras)
- source: [FreeUserUpsellView.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/States/FreeUserUpsellView.swift)

T2 is the prominent recommendation; Cam Plus and Cam Unlimited Pro are alternatives. Bird Watch is added as an alternative when the account owns any Bird Cam.

### UPSELL-003 — Unmatched layout (<4 cameras)
- source: [FreeUserUpsellView.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/States/FreeUserUpsellView.swift)

T1 is prominent; Cam Unlimited and Cam Unlimited Pro are alternatives.

### UPSELL-004 — Bird-only account
- source: [FreeUserUpsellView.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/States/FreeUserUpsellView.swift), [Bird Watch PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/3986128904)

If every owned camera is a Bird Cam, Bird Watch is the recommended card and security-plan alternatives are removed. Bird Watch surfaces must NOT show Cam Plus, Cam Unlimited, Cam Unlimited Pro, Pro AI, Cloud 180, CVR, NBD, Face, DA, or E-911 upsells.

### UPSELL-005 — One primary recommendation
- source: [KB page of record §Upsell A](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

The service page shows one primary recommendation per account/device segment; alternatives are allowed, never a flat equal catalog.

### UPSELL-006 — T3 crossover trigger
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264)

When a user has Pro AI on 3 or more cameras, show a Cam Unlimited Pro comparison priced against the full stack (Cam Plus + Pro AI) — never add-on price alone. The threshold is computed at the confirmed $4.99/device/month price.

### UPSELL-007 — Crossover upgrade behavior
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264), [KB page of record §Upgrade behavior](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Choosing T3 from the comparison routes through the upgrade flow and auto-cancels the Pro AI child add-ons (T3 includes the capability). Billing treatment is platform-specific — do not promise a refund.

### UPSELL-008 — "Keep current plan" dismissal
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264)

Dismissing the comparison suppresses it until the next relevant device addition.

### UPSELL-009 — T3 downgrade retention
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264)

The downgrade/cancel flow may offer Pro AI retention on selected cameras; self-serve T3→T2+add-on is NOT the default path — a full downgrade routes through support.

### UPSELL-010 — Session fatigue cap
- source: [PRD - Wyze Add-on (Pro-AI first)](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3917152264)

No more than 3 upsells per session; server-side merchandising keeps the visible set relevant.
