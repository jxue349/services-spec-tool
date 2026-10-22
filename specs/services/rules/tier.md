# Tier & product identity (TIER)

### TIER-001 — T1 is Cam Plus
- source: [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service), [Services Rebuild 2024](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/2246541971)

T1 = Cam Plus: a device/license-quantity-based base security plan. Membership group `cam-plus`; plan IDs `cam-plus-monthly`, `cam-plus-yearly`, plus trial IDs. One license covers one camera, so quantity is meaningful.

### TIER-002 — T2 is Cam Unlimited
- source: [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service)

T2 = Cam Unlimited: an account-level plan covering ALL cameras on the account. Group `cam-unlimited`; plan IDs `cam-unlimited-monthly`, `cam-unlimited-yearly`. Includes the full T1 feature baseline.

### TIER-003 — T3 is Cam Unlimited Pro (service code `cam-ultimate`)
- source: [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service), [BCS-137](https://wyzelabs.atlassian.net/browse/BCS-137)
- refs: V-13 (exact trial plan ID unrecorded)

T3 = Cam Unlimited Pro: the account-level top tier. Customer-facing name is Cam Unlimited Pro; the internal service code remains `cam-ultimate` as deliberate compatibility debt. Plan IDs `cam-ultimate-monthly`, `cam-ultimate-yearly`, plus a trial ID. Includes the full T2 baseline and the Pro AI bundle.

### TIER-004 — T0 is the $0 / legacy class
- source: [Platform API Product Doc](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3842441258)

T0 = $0 or legacy plans (e.g., CPL, Sprinkler Plus, Cam Base Free). T0 is never interchangeable with T1/T2/T3.

### TIER-005 — ~~"Cam Unlimited Light"~~ (never a Wyze product)
- source: Owner decision (Jing, 2026-10-06); [Wyze Products and Services](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1935573234)
- superseded-by: resolved — not a product

"Cam Unlimited Light" was never a Wyze product. It has no tier, group, plan ID, service code, or price. Any occurrence in an app, report, or payload is an error or a typo (closest real name: Cam Plus Lite, TIER-006) — correct the source rather than modeling it.

### TIER-006 — Cam Plus Lite (CPL) identity
- source: [Wyze Products and Services](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1935573234)

Cam Plus Lite is the confirmed legacy "Lite" service. Group `edge_ai`; plan IDs `cam-plus-lite-free`, `cam-plus-lite-monthly`, `cam-plus-lite-yearly`. It is not a T-tier and not a replacement for one.

### TIER-007 — Cam Protect (CPT) identity
- source: [Cam Protect (CPT) Overview](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1822883851)

Cam Protect is the legacy professional camera-monitoring service, formerly Cam Plus Pro; internal identity `cam-plus-pro`. No new purchases. Treated separately from T1/T2/T3 and from HMS.

### TIER-008 — HMS identity
- source: [Membership Plan & Service](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/1789690275/Membership+Plan+Service)

HMS = Wyze Home Monitoring. Group `hms`; plan IDs `home-monitoring-monthly`, `-three-monthly`, `-six-monthly`, `-yearly`. HMS is a monitoring service, not a camera base plan.

### TIER-009 — Never rename `cam-ultimate` without compatibility review
- source: [BCS-137](https://wyzelabs.atlassian.net/browse/BCS-137)

The `cam-ultimate` service code must not be renamed without an app-compatibility check; the display-name/service-code split is intentional.

### TIER-010 — `cam-plus-pro` means Cam Protect
- source: [BUG-60257](https://wyzelabs.atlassian.net/browse/BUG-60257)

Service code `cam-plus-pro` on an account means Cam Protect — never evidence the customer has Cam Plus or Cam Unlimited Pro.

### TIER-011 — Window Cam / Cam Base Free
- source: [SNAP-264](https://wyzelabs.atlassian.net/browse/SNAP-264)

Window Cam (`GW_WC`) maps its free experience to service `cam-base`, plan `cam-base-free` — a T0 free camera capability, not CPL ownership and not a paid add-on.

### TIER-012 — Bird Watch is standalone
- source: [Bird Cam integration](https://wyzelabs.atlassian.net/wiki/spaces/CRD/pages/4284317840/Bird+Cam), [Bird Watch PRD](https://wyzelabs.atlassian.net/wiki/spaces/A/pages/3986128904)

Bird Watch is a standalone license-based subscription for the Window Bird Cam (`GW_WBDC`) — outside the T1/T2/T3 Security Plan hierarchy and NOT a Cam Plus add-on. See [bw.md](bw.md).
