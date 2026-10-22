# Features by tier (FEAT)

Device/model exceptions are governed by the compatibility matrices (FEAT-004); these rules give the customer-facing baseline.

### FEAT-001 — T1 (Cam Plus) feature set
- source: [Cam Plus product page](https://www.wyze.com/products/cam-plus), [Service Plans comparison](https://www.wyze.com/pages/service-plans), [Compare plans](https://www.wyze.com/pages/compare)

Per-camera/device license. Smart detections: **person, pet, vehicle, and package** (the live service-plans comparison also lists garage-door detection and sound alerts — glass break, barking, crying — across all tiers), with event-based recording. Event-type/text filters and event notifications. **14-day rolling cloud storage** for event-based recordings, full-length event clips with no cooldown, web/desktop access. NOT included in base T1: Smart Mode, Friendly Faces, Wyze Stories, AI Video Search.

### FEAT-002 — T2 (Cam Unlimited) feature set
- source: [Service Plans comparison](https://www.wyze.com/pages/service-plans), [What's New: Managing Your Wyze Security Plan on the Web](https://wyzelabs.atlassian.net/wiki/spaces/WWA/pages/4264427570)

Everything in T1 for ALL covered cameras, account-level coverage, 14-day rolling cloud storage, plus **Smart Mode** (account-level self-monitoring controls), **Friendly Faces**, and multi-camera timeline.

### FEAT-003 — T3 (Cam Unlimited Pro) feature set
- source: [Introducing Cam Unlimited Pro](https://support.wyze.com/hc/en-us/articles/32576980891547-Introducing-Cam-Unlimited-Pro), [Cam Unlimited Pro product page](https://www.wyze.com/products/cam-unlimited-pro)

Everything in T2, plus **60-day rolling cloud storage**, **Wyze Stories**, **AI Video Search** across covered cameras, and **AI filter / AI-described alerts**. Includes the Pro AI bundle (ADDON-004) and Cloud 60 (ADDON-011). **Cloud CVR is NOT included in T3** (ADDON-010).

### FEAT-004 — Matrices are authoritative for device support
- source: [Camera Model / Service Compatibility Matrix](https://wyzelabs.atlassian.net/wiki/spaces/WC/pages/2235531272), [Add-on Tier and Device Model Support Matrix](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/3978428449)

Device- and model-level feature eligibility is governed by the Camera Model / Service Compatibility Matrix and the Add-on Tier and Device Model Support Matrix. The matrices override marketing/feature copy.

### FEAT-005 — Never infer eligibility from feature copy
- source: [KB page of record](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Never infer add-on eligibility or entitlement behavior from customer-facing feature copy alone.

### FEAT-006 — HMS gifts a Cam Plus/T1 license
- source: [SVCWEB-5579](https://wyzelabs.atlassian.net/browse/SVCWEB-5579), [HMS-973](https://wyzelabs.atlassian.net/browse/HMS-973)
- refs: V-08 (gift scope — quantity, conditions, revocation — unconfirmed)

HMS users receive a free (gifted) Cam Plus/T1 license, so subscription-center UI exposes Cam Plus as the camera base plan and HMS separately as monitoring.

### FEAT-007 — Advanced Vehicle Detection search exception
- source: [Advanced Vehicle Detection](https://support.wyze.com/hc/en-us/articles/56591984318107-Wyze-Intelligence-Advanced-Vehicle-Detection)

With an active T1 or T2 subscription on a supported app/camera combination, users can use Event Filters and the Video Search bar to search for detected service vehicles. T3 includes this plus the broader AI Video Search capability.

### FEAT-008 — Naming: Wyze Stories and AI filter
- source: [Introducing Wyze Stories](https://www.wyze.com/pages/stories), [KB page of record](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Use **Wyze Stories** (evolves the former Descriptive Alerts). Older docs may say `MBD`/`NBD`; new requirements use **AI filter**, keeping older terms only as search aliases and migration context.

### FEAT-009 — Window Cam free Person detection
- source: [SNAP-264](https://wyzelabs.atlassian.net/browse/SNAP-264), [FR-1233](https://wyzelabs.atlassian.net/browse/FR-1233), [FR-1327](https://wyzelabs.atlassian.net/browse/FR-1327)
- refs: V-20 (one citation on the Confluence page points at the wrong URL)

Canonical wording: "Window Cam supports free Person detection under Cam Base Free, subject to firmware eligibility." NEVER "3-person detection." Firmware `1.3.0.40+` supports the Person toggle (`1.3.0.0–1.3.0.39` cannot expose it); `1.3.0.47` was the first testing release with Free Person Tag & Notification; `1.3.0.63` moved free Person detection from single-frame to multi-frame analysis. Free users get Person tags and notifications; the paid experience is unchanged.

### FEAT-010 — Free person detection ≠ CPL
- source: [KB page of record §A1](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

Free person detection (free PD) is a camera-model/tier capability on some models — current examples: Flatlight Pro, Doorbell Pro, Cam V3 Pro, Window Cam. Never infer CPL ownership from free PD; CPL is a legacy plan with its own identity, amount, source, and coverage.

### FEAT-011 — Wyze Stories grouping & notification mechanics
- source: Golden QA v1 Q21/Q22 (owner-verified)

Each clip is evaluated on arrival against active stories (no fixed wait). A normal story accepts new clips until **20 minutes idle**, closing at a **4-hour maximum span or 50 clips** (the older 120-minute window applies only to legacy/null-event grouping). On grouping, the summary and a **1–5 importance score** refresh. Notification floors by Wyze Intelligence setting: All Notifications = 1, High Importance (default) = 3, internal critical-only = 4 (not user-selectable). Pushes use the story ID so later alerts update the same notification; routine alerts may be slightly delayed, urgent events notify immediately, and importance filtering never deletes recordings.

### FEAT-012 — Stories × device-notification interplay
- source: Golden QA v1 Q23 (owner-verified)

In legacy camera settings (pre-camera-SDK), with All Motion on, the device offers "Receive all motion notifications" and other motion types. With Stories ON and importance OFF, the user first receives a motion notification regardless of importance/story membership; it then updates to a descriptive alert and applies event grouping. Importance settings and smart detections are enabled by default on purchase of T3, Pro AI, or any subscription plan, and can also be enabled manually.

### FEAT-013 — Friendly Faces quota
- source: Golden QA v1 Q24 (owner-verified)

**10 named face profiles per ACCOUNT** (shared across the Family and Others groups), never per camera. Unknown faces and extra captures of already-registered people do not count against the quota. Friendly Faces requires T2+ (FEAT-002).
