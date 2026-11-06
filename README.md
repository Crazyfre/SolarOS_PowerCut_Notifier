# SolarGuard ☀️

SolarGuard is an independent, open-source companion application designed for monitoring **SolarOS**-powered solar inverters and battery storage systems. It polls authenticated cloud telemetry to detect grid outages, tracks outage statistics, and visualizes live household power flows. Detection requires an internet connection and depends on the polling cadence and the freshness of SolarOS data.

---

## 🚀 Key Features

* **Real-time Inverter Telemetry**: Live flow diagram illustrating production from Solar PV, house load consumption, grid exchange (importing/exporting), and battery state-of-charge.
* **Instant Power Cut Alarms**: MAX importance notifications that trigger custom alarm siren sounds immediately when the grid relay goes offline.
* **Customizable Siren Tones**: Choose between multiple bundled sirens and alerts (Classic Siren, Emergency Warble, Digital Beeps, Gentle Chime).
* **Alarm Duration Control**: Auto-dismisses alarms after a user-configured duration (5s, 10s, 15s, or 30s) to avoid ringing indefinitely.
* **Quiet Hours**: Silences alerts during scheduled hours (e.g. overnight) to prevent disruption.
* **Historical Outage Logging**: Keeps a local record of power grid cuts, tracking start times, restore times, total durations, peak house load, and battery state drops.
* **Developer Override Simulator**: Built-in mock panel in settings to simulate telemetry states (Grid status, Solar output, battery level, etc.) for testing notification triggers.

---

## 🛠️ Tech Stack & Development Setup

SolarGuard uses **React Native** and **Expo SDK 57**. Background monitoring and the custom alarm engine target Android native builds.

### Prerequisites
* [Node.js](https://nodejs.org/) 24, matching the CI environment.
* Android Studio / Android SDK and an Android device or emulator for native builds.

### Run Locally
1. Clone this repository
2. Install packages:
   ```bash
   npm ci --legacy-peer-deps
   ```
3. Build and launch the Android development app:
   ```bash
   npx expo run:android
   ```
4. For later development sessions, run `npx expo start --dev-client` and open the installed development app. Use a native development build or APK to verify notification sounds, background monitoring, and geofences. Expo Go cannot validate these features.

Run `npm run typecheck` and `npm test` before building. See [APPLICATION_AUDIT.md](APPLICATION_AUDIT.md) for the reviewed behavior, measured bundle reductions, and remaining validation work.

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## ⚖️ Disclaimer

**SolarGuard is an independent, open-source companion application for SolarOS-powered systems.**

* **Not Affiliated**: This project is **not affiliated with, endorsed by, or supported by SolarOS** or its respective owners.
* **API Usage**: SolarGuard communicates with the same authenticated APIs used by the official SolarOS web application. Users are solely responsible for ensuring that their use of SolarGuard complies with the Terms of Service applicable to their SolarOS accounts.
* **Ownership**: Use this application only with accounts and systems you own or are explicitly authorized to access.
* **Use Case**: This project is intended for **educational and personal use only**. The authors assume no liability for account suspensions, service issues, or incorrect/delayed alert delivery.
