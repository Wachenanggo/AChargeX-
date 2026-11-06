# AChargeX — Find. Charge. Manage.

AChargeX is an EV charging platform for the Philippines. It's one web codebase that you can install as a PWA or package as Android/iOS apps with Capacitor, plus an OCPP backend that real chargers connect to.

| | |
|---|---|
| **AChargeX Go** — driver app | Find stations on a map or list, scan a charger QR code, set a ₱200 / ₱500 / Full (capped) limit, watch live charging and get a receipt. Garage and Wallet too. |
| **AChargeX Network** — owner portal | Register stations, pick the location on a map, add chargers, connectors and tariffs, get each charger's connection URL and password, and print QR labels. |
| **AChargeX Control** — CSMS | Live charger fleet, connector states, sessions, the OCPP message log, and remote commands (each behind a confirm step). Also approvals, commissioning, alerts, payments and the audit log. |
| **OCPP service** | One endpoint for **OCPP 2.0.1 and 1.6J**, with the version picked automatically. Chargers log in with Basic auth. Includes a simulator that is fully isolated from real chargers. |

![AChargeX Go on a phone](docs/screenshots/go-mobile.png)

| Find (desktop) | Network — station | Control — charger |
|---|---|---|
| ![](docs/screenshots/go-desktop-find.png) | ![](docs/screenshots/network-station.png) | ![](docs/screenshots/control-charger.png) |

<sub>These screenshots were rendered in a sandbox that blocks map tiles, so the map area is blank. Real browsers load OpenStreetMap tiles.</sub>

## Run it locally
```bash
npm install
npm run dev        # OCPP service on :8080 (with simulated chargers) + web app on :5173
```
Open http://localhost:5173. With no keys configured it runs in **demo mode**: the stations, chargers and payments are all simulated and clearly labelled DEMO. To try Network or Control, go to **Account → Demo mode** and switch role.

## Tests
```bash
npm test                 # 33 tests, incl. full charging sessions over real WebSockets (OCPP 1.6 + 2.0.1)
npm run build
node scripts/screens.mjs http://localhost:4173 screenshots   # 16 screens × 7 viewports + overflow audit
node scripts/e2e.mjs http://localhost:4173 screenshots/e2e   # UI flows
sudo bash supabase/tests/rls_check.sh                        # database RLS checks
```

## Deploy for free
See **[DEPLOY.md](DEPLOY.md)**:
- Vercel hosts the web app.
- Supabase handles auth and the database.
- An Oracle Always Free VM runs the OCPP service (Vercel can't keep a charger's WebSocket open).
- GitHub Actions builds the Android APK.
- Codemagic builds the iOS/TestFlight app, so you don't need a Mac.

## Connecting a charger
Register the charger in **AChargeX Network**. Then enter the Central System URL it shows you (`wss://<your-ocpp-host>/ocpp/<identity>`), plus the identity and password, into the charger's own OCPP settings. Drivers can only charge there once three things are true:
- the station is approved,
- the charger has connected,
- an admin has commissioned it.

## Project layout
```
apps/web          React + Vite + Tailwind PWA (Go, Network, Control) + Capacitor config
apps/ocpp         Node OCPP CSMS + REST/SSE API + simulator (+ Dockerfile)
packages/shared   Domain model, business rules, OCPP-J RPC core
supabase/         Schema + row-level security, demo seed, RLS test
deploy/           Oracle VM docker-compose + Caddy; render.yaml at root
design-references Visual references for the driver app
.claude/skills    Project skills for Claude Code (UI/UX, EVSE/OCPP, quality)
```
