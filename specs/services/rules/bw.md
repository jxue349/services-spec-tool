# Bird Watch — standalone subscription (BW)

### BW-001 — Identity
- source: [Bird Cam integration](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4284317840/Bird+Cam)
- refs: V-24 (service-code spelling `bird_watch` vs `bird-watch`)

Service code `bird-watch`; recurring plan IDs `bird-watch-monthly` / `bird-watch-yearly`; supported device `GW_WBDC` ONLY; Bird Cam free/base plan is `cam-base-free` via service `cam-base`; per-device service ID `sid_bird_watch_gw_wbdc` — the service ID is NEVER used as the recurring `plan_id`.

### BW-002 — Price (pre-launch, NOT final)
- source: [Bird Cam integration](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4284317840/Bird+Cam), [Bird Watch Paywall PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/4136206339), [Bird Watch PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/3986128904), [Project Peek PRD](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3793092638)
- refs: V-18

Launch target Nov 2026; pricing is an open Product/Finance decision. Documented positions: (a) $5.99/mo / $59.99/yr per device (integration-page config, Project Peek positioning); (b) $6.99/mo / $69.99/yr (Paywall PRD IAP table — the newest pricing artifact, with per-quantity tiers to 9 licenses; also the PRD config block); Project Peek's open items carry a $5.99/$49.99 variant. Do not quote any Bird Watch price as final until the decision lands.

### BW-003 — Trial
- source: [Bird Cam integration](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4284317840/Bird+Cam)

30-day trial offered during Bird Cam setup; one trial per Bird Cam device.

### BW-004 — Per-device binding
- source: [KB page of record §Bird Watch](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Each Bird Cam requires its own Bird Watch subscription; a second `GW_WBDC` needs a second subscription. Never account-wide/unlimited.

### BW-005 — Eligibility
- source: [KB page of record §Bird Watch](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

`bird-watch-*` plans support only `GW_WBDC`. Normal security cameras are not eligible, and a user who owns only a normal camera cannot purchase Bird Watch.

### BW-006 — Purchase surfaces
- source: [Bird Watch Paywall PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/4136206339), [KB page of record §Bird Watch](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)
- refs: V-24 (launch commerce platform IAP vs Stripe unresolved)

Bird Watch is purchased from the Bird Cam plugin, setup flow, or Bird Cam acquisition surface ONLY — never in the Security Plans comparison table or as a generic add-on in the Services tab. Mixed households keep T1/T2/T3 for security cameras and a separate Bird Watch for the Bird Cam; Bird Cam events and Bird Watch upsells stay isolated from security-plan surfaces.

### BW-007 — Free vs paid capability split
- source: [Bird Watch PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/3986128904)

Free Bird Cam: live stream, bird detection/event capture, local SD recording + clip sharing, bird event notifications with free-tier cooldown. Bird Watch adds: species recognition (PRD target 3,000+ species), 60-day cloud video recording, no-cooldown Bird Arrival notifications, and Bird Log / Bird Album / Bird Facts / expanded highlights.

### BW-008 — Lifecycle
- source: [KB page of record §Bird Watch](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

On expiry/cancellation the Bird Cam falls back to `cam-base-free` (it never becomes a Cam Plus device). If the last Bird Cam is removed while Bird Watch is active, prompt for cancellation — do NOT auto-cancel.

### BW-009 — Provider product IDs
- source: [BCS-451](https://wyzelabs.atlassian.net/browse/BCS-451), [BCS-452](https://wyzelabs.atlassian.net/browse/BCS-452)

Apple `B10001`–`B10009` → `bird-watch-monthly`, `B20001`–`B20009` → `bird-watch-yearly` (N = quantity 1–9); Google `b1001`–`b1009` monthly, `b2001`–`b2009` yearly. Never map Bird Watch products to numeric Security Plan IDs.
