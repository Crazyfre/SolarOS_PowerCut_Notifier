# Application audit — 6 November 2026

Reviewed SolarGuard `3.1.6-beta.3`: authentication, station selection, telemetry, foreground and headless monitoring, geofences, notifications, storage, outage history, analytics, report generation, startup, and build configuration. Existing edits in AppContext and SettingsScreen were retained and extended.

Several core behaviors were incorrect despite the initial TypeScript check passing. The verified fixes below improve reliability and reduce bundle size. This review does **not** establish that every function or native device behavior is correct; remaining issues are listed explicitly.

## Fixed issues

| Priority | Problem and resulting behavior | Main implementation |
| --- | --- | --- |
| High | Saving another station changed a preference but left the monitoring system ID unchanged. Saving now updates the persistent target, clears the previous station snapshot, and uses the selected station for subsequent polls. | [AppContext](src/context/AppContext.tsx) |
| High | UI, service, and headless polls could overlap, refresh the same token repeatedly, and process the same transition concurrently. HTTP requests are coalesced per station/session, refreshes are shared, and detection runs are serialized. | [solar API](src/api/solar.ts), [auth service](src/services/authService.ts), [detector](src/services/stateDetector.ts) |
| High | A token refresh or telemetry request finishing after logout could restore credentials or display obsolete data. Session versions, serialized credential writes, and stale-result guards prevent those paths. | [secure storage](src/storage/secureStore.ts), [AppContext](src/context/AppContext.tsx) |
| High | Android notification channels were placed in notification content instead of the trigger, so sound/channel preferences could be ignored. They now use the immediate channel-aware trigger supported by Expo. | [notifications](src/services/notifications.ts) |
| High | Quiet hours were stored but never applied. Overnight and daytime windows now route alerts through soundless channels and suppress native sirens. Remote grid-restored alerts also respect their remote context. | [notifications](src/services/notifications.ts) |
| High | Unknown fence state was treated as outside by the foreground service, suppressing sirens and stopping monitoring. Unknown now remains siren-capable. Only confirmed outside state causes shutdown. | [foreground service](src/services/foregroundService.ts) |
| High | A stopped service could finish HTTP, detect an event, and redisplay its foreground notification. Each run now has cancellation checks. Outside/budget shutdown also completes when the final request fails. | [foreground service](src/services/foregroundService.ts) |
| High | The foreground service omitted an explicit dataSync type, could select location during permission failures, and recalculated its type mid-run. The effective type is now selected explicitly and pinned until restart. | [foreground service](src/services/foregroundService.ts) |
| High | The remote polling interval used `15` seconds where the code intended 15 minutes. Registration now passes `900` seconds. | [remote polling](src/services/remotePolling.ts) |
| High | Detector state was shared across stations and simulation mode; battery warning flags disappeared on process restart. State and warning flags now persist separately for each station and mode. | [detector](src/services/stateDetector.ts) |
| Medium | Outage restoration used the minimum battery charge as the starting charge, while history assumed a 100% start. Records now retain observed start/end/minimum charge separately and compute the actual observed drop. Legacy unknown starting values remain unknown. | [detector](src/services/stateDetector.ts), [history](src/screens/HistoryScreen.tsx) |
| Medium | Starting the app during an existing outage skipped its first battery warning and never established a running record. The initial outage observation now records a baseline and evaluates battery warnings. | [detector](src/services/stateDetector.ts) |
| Medium | Notification delivery failures could interrupt outage-stat updates. History is committed before delivery, and each alert failure is isolated. Restore transitions stop the native siren even when restore notifications are disabled. | [detector](src/services/stateDetector.ts) |
| Medium | Concurrent zone registration/unregistration could leave an old fence active; concurrent fence-state writes could discard transition fields. Lifecycle operations and state writes are serialized. GPS verification also has a bounded wait. | [geofence service](src/services/geofenceService.ts), [geofence storage](src/storage/geofenceStore.ts) |
| Medium | Rolling budget calculations counted portions older than 24 hours, and overlapping/delayed writes could double-count or discard runtime. Segments are clipped, merged, and written serially. | [budget storage](src/storage/dataSyncBudgetStore.ts) |
| Medium | Malformed counters or numeric strings could break rendering and report formatting. The API boundary validates grid state/battery charge and normalizes finite numeric counters. Invalid saved settings recover usable defaults; JSON-persisted open tariff bounds are restored. | [solar API](src/api/solar.ts), [settings storage](src/storage/settingsStore.ts) |
| Medium | Settings saves swallowed storage failures and could report success. They now reject failures, retain the previous in-memory settings on failure, and prevent duplicate Save actions. | [settings storage](src/storage/settingsStore.ts), [settings screen](src/screens/SettingsScreen.tsx) |
| Medium | Missing alarm/Notifee native modules could crash module imports; font-load failures could leave the splash indefinitely. Optional adapters and the font-error fallback allow startup to progress. Native features still require a native build. | [native adapter](src/services/nativeMonitoring.ts), [alarm adapter](modules/outage-alarm/index.ts), [App](App.tsx) |
| Medium | Boot identity used a millisecond clock subtraction that could vary within one boot. The Kotlin module now reads the OS boot counter. This native change still needs compilation/device verification. | [alarm module](modules/outage-alarm/android/src/main/java/com/solarguard/alarm/OutageAlarmModule.kt) |
| Low | Release comparisons mishandled beta versions and workflow `release-v` tags. Reported installed PV capacity was fabricated from battery capacity. Tariff cliff calculations used the wrong boundary for a two-month cycle. These calculations and labels are corrected. | [updates](src/services/updateChecker.ts), [report generator](src/services/reportGenerator.ts), [tariffs](src/services/tariff/ksebTariff.ts) |

Channel routing was checked against both the installed Expo implementation and the [Expo channel-aware trigger documentation](https://docs.expo.dev/versions/latest/sdk/notifications/#channelawaretriggerinput).

## Performance measurements

Compared local Android production exports before and after restricting font/icon imports. Both use the installed toolchain and the same export command; assets below are uncompressed export files, not APK download size.

| Measurement | Before import optimization | Final export | Reduction |
| --- | ---: | ---: | ---: |
| Hermes JavaScript bundle | 5,946,093 bytes | 4,177,357 bytes | 29.75% |
| Exported asset bytes | 8,605,179 bytes | 1,821,183 bytes | 78.84% |
| Exported asset files | 54 | 25 | 29 files |
| Metro module count | 3,435 | 1,709 | 1,726 modules |

The app now imports eight used font variants and a limited icon catalog through public per-icon entry points. Headless notification colors no longer import the React provider tree. Identical outage observations avoid rewriting history. Concurrent polls share requests rather than starting more HTTP work.

These are measured size and work reductions. Startup time, frame rate, battery consumption, and network latency were not measured on a device; no numerical speedup is claimed for those.

## Verification

- `npm run typecheck`: passed.
- `npm test`: **53 tests passed**. Tests execute application TypeScript with isolated storage, network, and native boundary substitutes. Provider tests use a small hook scheduler, not a device renderer.
- Existing `node scratch/tariff-check.mjs`: **29 checks passed**, using the repository's configured rates. This verifies arithmetic, not current statutory tariff accuracy.
- Android production JavaScript/Hermes export: passed, 1,709 modules and 25 assets. Local output: `scratch/audit-android-verified`.
- `git diff --check`: passed.
- Offline native Kotlin compilation was attempted, but Gradle could not resolve uncached `org.gradle.toolchains:foojay-resolver:1.0.0`. No APK or successful native compilation is claimed.
- Type checks and tests now run in pull-request CI and before the release build.

## Remaining issues and recommended next work

1. **Native alarm behavior still has unresolved edge cases.** In [notifications](src/services/notifications.ts) and [OutageAlarmService](modules/outage-alarm/android/src/main/java/com/solarguard/alarm/OutageAlarmService.kt), both the notification channel and MediaPlayer can produce audio. The native alarm notification does not receive the no-popup preference. A restore calls stop followed immediately by start, while the native service refuses starts until its state becomes idle; the restoration chime can race service destruction. These are code-level findings, not observed device results. Consolidate audio ownership and native lifecycle handling, then test every tone/duration, dismiss, restore, quiet-hours, and no-popup combination on Android.
2. **Grid alert delivery has no durable retry queue.** A failed grid notification is logged after the transition is committed; it will not automatically retry on the next identical poll. Battery warning flags do retry until successful. A persisted event outbox with idempotent delivery would strengthen grid-alert reliability. Also test notification scheduling failure independently of native siren startup, which currently follows successful scheduling for critical notifications.
3. **Live hardware and OS recovery remain unverified.** No SolarOS account or connected inverter was exercised. Validate locked-screen operation, background permission denial/revocation, process death, reboot, missed transitions, and budget exhaustion on Android 14/15+. Android's dataSync budget is a platform constraint; the local ledger is a conservative application policy, not a replacement for native timeout handling. See [Android foreground-service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout).
4. **Polling cannot guarantee instant or offline detection.** UI refreshes run every 30 seconds; the configured foreground-service default is five minutes; remote checks request 15 minutes and remain best effort. The displayed fetch time also does not prove the inverter source timestamp is fresh. Add a distinct source-data age/staleness indicator once the API timestamp format and cadence are confirmed. For substantially faster background detection, investigate an authenticated push/event source supported by the backend.
5. **Financial scope is limited.** `computeSavings` currently implements net metering even though the type permits net billing and gross metering. Monthly-cycle projection and lifetime aggregation need clearer period semantics before supporting arbitrary configurations. Lifetime totals apply today's configured slabs to multi-period aggregates and remain indicative. Fixed charges and other bill components are excluded by design. Validate tariff inputs against the intended customer's bill before treating estimates as exact.
6. **Legacy history has no station provenance.** Old records without a system ID remain visible for compatibility. They cannot be reliably assigned to a station after the fact. New records are scoped correctly. The retained 50-record limit is shared across stations.
7. **Background API migration is still advisable.** The installed application uses `expo-background-fetch`; [Expo marks that API deprecated](https://docs.expo.dev/versions/latest/sdk/background-fetch/). Plan migration to its supported replacement with device lifecycle tests. Profile UI rendering on a release device before making further context/state architecture changes.

The core JavaScript paths listed above now have repeatable checks, but the unresolved native alarm findings and missing native/device validation prevent an honest claim that all application functions are correct.
