# Cam Plus camera selection & editor (PICKER)

Evidence is iOS code; Android/web parity unconfirmed (see register V-12).

### PICKER-001 — Cam Plus picker cap
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift)
- refs: V-12, V-23

The picker supports at most 3 Cam Plus cameras — Cam Plus IAP SKUs only exist for 1/2/3 cameras (10001–10003 monthly, 20001–20003 yearly). No automatic SKU switch to Cam Unlimited at the cap; the user is routed to the "Save with Cam Unlimited" upsell card.

### PICKER-002 — Cam Unlimited card threshold
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift)

The "Save with Cam Unlimited" card becomes eligible at 4 or more owned cameras. The selected count includes existing effective Apple seats plus new selections when resolving the quantity SKU and billing cycle.

### PICKER-003 — Cross-platform coverage locks
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift)

Cameras already covered by T1, T2, T3, or CPU are locked regardless of purchase platform (Apple, Google, web, other). CPT and HMS coverage do NOT lock — those rows stay selectable for Cam Plus (CPT rows show an "On Cam Protect" reminder pill).

### PICKER-004 — Default selection
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift)

Preselect eligible, unlocked cameras up to the cap, skipping Cam Plus free-trialing cameras and incompatible rows.

### PICKER-005 — Billing-cycle continuity
- source: [ChooseCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/IAP/ChooseCamerasV2DataSource.swift)

An effective Apple subscription pins the purchase to that subscription's monthly/yearly cycle; otherwise an effective Cam Plus subscription on another platform supplies the cycle. Quantity resolves from the effective covered count, not only newly selected rows.

### PICKER-006 — Edit-screen over-cap upgrade path (spec vs implementation)
- source: [EditCoveredCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/Manage/Edit/EditCoveredCamerasV2DataSource.swift)
- refs: V-04

Product rule: over cap, the primary CTA changes to "Upgrade to Cam Unlimited" (no Cam Plus SKU exists above 3). Implementation: the upgrade path is fully built behind a LOCAL compile-time switch (`isUpgradePathEnabled = false`) — `requiresUnlimitedUpgrade` flips the CTA with CU price text when enabled; disabled, the editor is binding-only (selection capped at owned licenses). The flag is a launch toggle, not permission to drop the product rule.

### PICKER-007 — Full-seat assignment
- source: [EditCoveredCamerasV2DataSource.swift](https://github.com/wyzelabs-inc/wyze-module-service-aggregation-ios/blob/develop/WZServiceAggregation/Classes/UI/ServicePage/ServicePageV2/UI/Manage/Edit/EditCoveredCamerasV2DataSource.swift)

Every paid seat must be assigned before Save enables; the sole covered camera cannot be deselected — removing the last coverage requires cancellation, never a paid subscription with zero assigned cameras.
