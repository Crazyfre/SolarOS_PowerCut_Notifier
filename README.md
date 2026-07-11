# SolarGuard ☀️

SolarGuard is an independent, open-source companion application designed for monitoring **SolarOS**-powered solar inverters and battery storage systems. It provides critical, near-instantaneous offline-first alerts when your power grid goes down, helps track outage statistics, and visualizes live household power flows.

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

SolarGuard is built as a cross-platform mobile application using **React Native** and **Expo SDK 52**.

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Expo Go](https://expo.dev/client) app installed on your testing device, or Android Studio / Xcode simulator.

### Run Locally
1. Clone this repository
2. Install packages:
   ```bash
   npm install
   ```
3. Start the Metro Bundler:
   ```bash
   npx expo start
   ```
4. Scan the QR code with your phone or launch on an emulator. Note that custom notification alarm sounds require a **native development build** or APK bundle to load audio assets properly (default sounds play in standard Expo Go).

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
