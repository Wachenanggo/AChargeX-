# Deploying AChargeX for free

## ✅ Recommended for now: one free Render service (5 minutes, no credit card, no terminal)

Everything runs as **one service at one URL**: the web app, the API and the OCPP WebSocket endpoint. It's built from the root `Dockerfile` and configured by `render.yaml`.

1. Sign up at **render.com** with your GitHub account (works from an iPad browser).
2. **New → Blueprint →** pick the `AChargeX-` repo (branch `claude/nice-meitner-26a3s1`, or `main` once merged) → **Apply**.
3. Wait for the first build (~5–8 min). You get a URL like `https://achargex.onrender.com`:
   - **App:** `https://achargex.onrender.com`. Open it in Safari → Share → **Add to Home Screen** to use it like an app.
   - **Chargers:** `wss://achargex.onrender.com/ocpp/<identity>` (TLS is included, so no domain or certificate setup).
4. Done. It runs in **demo mode** with 13 simulated chargers, so you can try Go, Network and Control (switch role under Account → Demo mode). Every push to the branch redeploys automatically.

**Free-plan limits to know**
- It **sleeps after ~15 minutes with no visitors**. The next visit takes ~1 minute to wake up.
- Demo data (sessions, stations you add) **resets on every restart**, because there's no database yet.
- A sleeping service drops charger WebSockets, so it's fine for demos and for testing your own charger for a short while, but not for a public station.

### When to move beyond this
| You want… | Add |
|---|---|
| Real accounts and data that survive restarts | **Supabase** (section 1). Put `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Render's environment, set `DEMO_MODE=false`, and add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. |
| Real chargers connected 24/7 | Run the **same Docker image** on an always-on free VM (**Oracle Always Free**, section 2). |
| Android / iOS store apps | Sections 5–6 (set `VITE_API_URL` to your Render URL). |

> **Why not Vercel alone?** Vercel runs short-lived serverless functions. A charger keeps one WebSocket open 24/7, which needs a long-running server. Render (or a VM) runs the whole thing; Vercel is optional for the web app only (section 3).

---

## 1. Supabase (accounts + database)

1. Create a project at **supabase.com** (region: Singapore is closest to PH).
2. **SQL Editor → New query**: paste all of `supabase/migrations/0001_init.sql` → **Run**.
3. *(Optional, staging only)* paste `supabase/seed.sql` → Run, to load the DEMO stations.
4. **Project Settings → API**: copy
   - `Project URL` → used as `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (safe for the browser)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only — never in Vercel**)
5. **Authentication → URL Configuration**: Site URL = your Vercel URL; add it to Redirect URLs.
6. *(Optional)* **Authentication → Providers → Google**: enable, then set `VITE_GOOGLE_OAUTH=true` in Vercel.
7. Sign up once in the app, then make yourself super admin (SQL Editor):
   ```sql
   update public.profiles set role = 'super_admin'
     where id = (select id from auth.users where email = 'you@example.com');
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}'
     where email = 'you@example.com';
   ```
   Sign out and back in. Afterwards assign roles with `select set_user_role('<user uuid>', 'owner');` (audited).

The OCPP service verifies tokens with your project's JWKS automatically. `SUPABASE_JWT_SECRET` is only needed for projects that still use the legacy HS256 secret.

## 2. Always-on: Oracle Always Free VM (for real chargers)

1. Sign up at **cloud.oracle.com** → Create a **VM instance** (Ubuntu 22.04/24.04, "Always Free eligible" shape, e.g. Ampere A1 1 OCPU / 6 GB).
2. Networking: in the VCN's security list add **Ingress TCP 80 and 443** from `0.0.0.0/0`.
3. Get a free domain: **duckdns.org** → create `yourname.duckdns.org` pointing at the VM's public IP.
4. SSH in (Oracle's Cloud Shell works from an iPad) and run:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save || true
   git clone https://github.com/<you>/AChargeX-.git && cd AChargeX-
   cp apps/ocpp/.env.example apps/ocpp/.env && nano apps/ocpp/.env
   ```
   Set at least:
   ```
   PUBLIC_OCPP_URL=wss://yourname.duckdns.org/ocpp
   PUBLIC_APP_URL=https://<your-app>.vercel.app
   CORS_ORIGIN=https://<your-app>.vercel.app,capacitor://localhost,https://localhost
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
5. Start it (Caddy fetches a free HTTPS certificate automatically):
   ```bash
   OCPP_DOMAIN=yourname.duckdns.org sudo -E docker compose -f deploy/oracle/docker-compose.yml up -d --build
   curl https://yourname.duckdns.org/api/health
   ```
6. Update later with `git pull && OCPP_DOMAIN=... sudo -E docker compose -f deploy/oracle/docker-compose.yml up -d --build`.

This runs the same all-in-one image (web app + API + OCPP) behind Caddy, so the VM URL serves the app too. Vercel isn't needed.

## 3. (Optional) Web app on Vercel

1. **vercel.com → Add New → Project →** import this GitHub repo.
2. **Root Directory:** `apps/web` (the included `vercel.json` handles the monorepo build and SPA routing).
3. **Environment Variables:**
   ```
   VITE_API_URL=https://yourname.duckdns.org
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_GOOGLE_OAUTH=false
   ```
4. Deploy. Only useful if you want the web app on Vercel's CDN; the Render / Oracle URL already serves it. Remember to add the Vercel origin to `CORS_ORIGIN` on the server.

## 4. Install on iPad / iPhone today (PWA, free, no Mac)
Open your app URL (Render or Vercel) in **Safari → Share → Add to Home Screen**. It launches full-screen like an app, works offline for the shell, and keeps the camera QR scanner.

## 5. Android APK (GitHub Actions)
1. GitHub repo → **Settings → Secrets and variables → Actions → Variables**: add `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. **Actions → Android APK → Run workflow.** When it finishes, download the `achargex-debug-apk` artifact and open it on an Android phone (allow "install unknown apps").
3. Play Store later: Google Play Console (US$25 one-time) + a signed release build.

## 6. iOS app without a Mac (Codemagic → TestFlight)
1. Join the **Apple Developer Program** (US$99/yr) and create the app record in App Store Connect with bundle id `ph.achargex.go`.
2. **codemagic.io** → connect the repo. Add an App Store Connect API key integration named `achargex_asc`, enable automatic iOS code signing for `ph.achargex.go`, and create an environment group `achargex` with the three `VITE_*` variables.
3. Start the **iOS → TestFlight** workflow (`codemagic.yaml`). Install the build on your iPad from the TestFlight app.

## 7. Connect a real charger
1. In **AChargeX Network → Add station**, register the station and its chargers. You'll get, per charger:
   - **Central System URL** — e.g. `wss://achargex.onrender.com/ocpp/AX-XXXXXXXX` (or your VM domain)
   - **Identity** (username) and a one-time **password** (HTTP Basic auth, OCPP Security Profile 1)
2. In the charger's own configuration (its web portal or installer app), set the OCPP / Central System URL, charge point ID and password. Choose OCPP 2.0.1 or 1.6J — the server negotiates either.
3. The station page shows **"Connected · OCPP x"** once the BootNotification arrives.
4. Submit the station for review → an admin approves it in **Control → Approvals** → then **Commission** the charger (allowed only while it's connected). Only then can drivers start charging.

## 8. Payments (before real money)
Only the **Demo wallet** is implemented, and it's refused on real chargers. To take real payments, implement a server-side adapter in `apps/ocpp/src/payments.ts` for your provider (e.g. PayMongo for GCash/Maya/cards/QR Ph, or Maya Business). Use provider-hosted checkout, webhook signature verification (`webhook_events` table, unique per event), idempotency keys, and capture ≤ hold. Never store card numbers or CVVs.

## Environment variable reference
| Variable | Where | Secret? |
|---|---|---|
| `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_OAUTH` | Vercel / GitHub vars / Codemagic | no (public) |
| `SUPABASE_URL` | OCPP server | no |
| `SUPABASE_SERVICE_ROLE_KEY` | OCPP server **only** | **yes** |
| `SUPABASE_JWT_SECRET` (legacy, optional) | OCPP server only | **yes** |
| `PUBLIC_OCPP_URL`, `PUBLIC_APP_URL`, `CORS_ORIGIN` | OCPP server | no |
| `DEMO_MODE`, `SIMULATOR`, `SIM_SPEED`, `ALLOW_UNREGISTERED_CHARGERS`, `ALLOW_DEMO_PAYMENT_ON_REAL` | OCPP server | no |
