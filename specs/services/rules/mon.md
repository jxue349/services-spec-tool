# Monitoring services — CPT & HMS (MON)

### MON-001 — CPT and HMS do not coexist
- source: [Cam Protect (CPT) Overview](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1822883851), [SVCWEB-4861](https://wyzelabs.atlassian.net/browse/SVCWEB-4861), Golden QA v1 Q7
- refs: V-06 (legacy cohort edge cases unconfirmed)

CPT and HMS do not work together on one account — they share the Monitoring tab but are distinct services with migration cohorts and conversion behavior. Never assume coexistence.

### MON-002 — CPT capabilities
- source: [Cam Protect (CPT) Overview](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1822883851)

Armed/disarmed monitoring states, Friendly Faces, Video Verification, emergency-dispatch flow; device-bound CPT licenses are part of the historical model.

### MON-003 — Compatibility per matrix
- source: [Camera Model / Service Compatibility Matrix](https://wyzelabs.atlassian.net/wiki/spaces/WC/pages/2235531272)

Camera eligibility for CPT/HMS is service- and model-specific — use the Compatibility Matrix (records CPT sunset behavior and separate HMS/CPT columns).

### MON-004 — Monitoring-tab selection priority
- source: [SVCWEB-5579](https://wyzelabs.atlassian.net/browse/SVCWEB-5579), [Cam Protect (CPT) Overview](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1822883851)

First match: (1) HMS present → HMS tab; (2) else CPT present → CPT tab; (3) else → new Monitoring tab (multi-camera timeline, standard monitoring, Smart Mode — Smart Mode availability still subject to plan/camera/rollout rules). HMS is evaluated before CPT when transitional data exposes both. The gifted Cam Plus/T1 license is NEVER the tab selector — it controls camera-entitlement display; `hms` controls the monitoring surface.

### MON-005 — Noonlight professional-monitoring split
- source: Golden QA v1 Q7 (owner-verified), [Cam Protect (CPT) Overview](https://wyzelabs.atlassian.net/wiki/spaces/WIZ/pages/1822883851)

CPT = camera-triggered Noonlight monitoring WITH video verification. HMS = sensor-triggered Noonlight monitoring. T3 connects to Noonlight but does NOT auto-trigger monitoring — the user must press the emergency button; T3 does no video verification (only CPT does). Noonlight contacts the user by SMS and phone and can dispatch law enforcement if the alarm is not answered or dismissed in time.
