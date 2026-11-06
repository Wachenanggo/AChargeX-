# AChargeX — notes for Claude Code

AChargeX ("Find. Charge. Manage.") is a Philippine EV-charging platform with three products in one codebase:

| Module | Route | Audience | Look |
|---|---|---|---|
| **AChargeX Go** | `/` | EV drivers (mobile-first, PWA + Capacitor) | white / pale-mint, electric-green actions, navy primary buttons |
| **AChargeX Network** | `/network` | charger owners / station operators | same light theme, denser |
| **AChargeX Control** | `/control` | CSMS operators & admins | dark navy + green, dense tables |

## Architecture
```
packages/shared   domain types, status/tariff/role/payment/QR rules, demo network,
                  runtime-agnostic OCPP-J RPC core (ocpp-rpc.ts) — used by both apps
apps/ocpp         Node CSMS: WebSocket /ocpp/<identity> (OCPP 2.0.1 + 1.6J, negotiated),
                  REST /api/*, SSE /api/events, isolated SIM-* simulator, Supabase mirror
apps/web          Vite + React 18 + TS + Tailwind + react-router + react-leaflet (OSM) +
                  Capacitor config + PWA. Talks ONLY to apps/ocpp's API (+ Supabase Auth)
supabase/         migrations/0001_init.sql (schema + RLS), seed.sql (DEMO), tests/rls_check.sh
design-references/achargex-go/  the 7 reference screens + tokens (visual reference only)
```
Key files:
- OCPP: `apps/ocpp/src/csms.ts` (sessions, commands, simulator isolation), `ocpp/v16.ts`, `ocpp/v201.ts` (version adapters → `domain.ts` contracts), `app.ts` (WS upgrade: subprotocol negotiation, Basic auth, SIM secret), `api.ts` (REST/SSE + permission checks), `auth.ts` (Supabase JWKS/HS256 + demo roles)
- Web: `src/App.tsx` (routes), `src/ui/index.tsx` (design-system components), `src/go/GoLayout.tsx` (bottom nav + Scan FAB < 1024px, sidebar ≥ 1024px), `src/go/data.tsx` (stations + live SSE patches + offline preview), `src/go/pages/*`, `src/network/*`, `src/control/*`
- Tokens: `apps/web/tailwind.config.js` (`ax-*` light, `ctl-*` dark)

## Commands
```bash
npm install
npm run dev            # OCPP service :8080 (with simulator) + web :5173 (proxies /api)
npm test               # vitest: shared rules + OCPP end-to-end over real sockets (1.6 & 2.0.1)
npm run typecheck
npm run build          # shared typecheck, ocpp bundle (esbuild), web build (PWA)
node scripts/screens.mjs http://localhost:4173 screenshots     # 7 viewports + overflow audit
node scripts/e2e.mjs http://localhost:4173 screenshots/e2e     # UI flows (charge, QR, guest, Control reset)
sudo bash supabase/tests/rls_check.sh                          # RLS/constraints on local Postgres 16
node scripts/make-icons.mjs      # regenerate PNG icons from public/images/app-icon.svg
npx tsx scripts/gen-seed.ts > supabase/seed.sql
```
For screenshots/e2e: `npm run build -w @achargex/web && (cd apps/web && npx vite preview)` with the OCPP service running.

## Deployment
Default free deployment = ONE service: root `Dockerfile` builds web + OCPP; the OCPP server serves `apps/web/dist` when `STATIC_DIR` is set (`apps/ocpp/src/static.ts`), so the API is same-origin (`VITE_API_URL` empty). `render.yaml` deploys it on Render's free plan; `PUBLIC_*` URLs default from `RENDER_EXTERNAL_URL`. `deploy/oracle` runs the same image always-on. `apps/ocpp/Dockerfile` is the API-only image.

## Design principles
- Mobile-first. Verify at 320, 360, 390, 430, 768, 1024, 1440. No horizontal overflow (screens.mjs asserts it).
- Phones: single column, bottom nav (Home · Find · **Scan FAB** · Garage · Wallet), content padded with `.pb-nav`; Find shows map **or** list + selected-station card. ≥768: Find is split list+map. ≥1024: sidebar, no bottom nav.
- Primary action = navy pill; charging action = green pill with navy text. Prices/kWh/IDs/timers in JetBrains Mono (`.num`). Micro-labels `.eyebrow`.
- Lucide icons only, no emoji. Illustrations are original SVGs in `src/assets/illustrations`.
- Everything simulated is labelled **DEMO** (stations, receipts, payments, chargers).

## Safety rules (do not break)
- Never fabricate live data. Simulated chargers use the `SIM-` prefix, `isSimulated`, and require the simulator secret header; sessions only route simulated↔simulated and real↔real.
- A command is `pending` until the charger's CALLRESULT; sessions become `charging` only after the charger reports a started transaction; totals come from meter readings.
- Charging limit is always bounded (₱1,500 cap for "Full"). Payment: hold → capture (≤ hold) → optional refund; void on failure. Demo payments are refused on real chargers.
- QR codes are opaque tokens resolved server-side. Scanning only navigates — never starts, authorizes or changes state.
- Permissions are enforced server-side (`api.ts` + RLS). Client guards are UX only. Roles come from `app_metadata.role`, never `user_metadata`.
- Never put `SUPABASE_SERVICE_ROLE_KEY` or provider secrets in `apps/web` / `VITE_*` vars.

## Workflow
Work in milestones. After each: implement → `npm test` → build → render with screens.mjs/e2e.mjs and look at the PNGs → fix → summarize. Don't claim visual verification without rendering. Project skills live in `.claude/skills/`.
