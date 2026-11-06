---
name: achargex-quality
description: Quality gate for AChargeX changes — tests, builds, browser verification at all viewports, security/permission review. Use before declaring any milestone done or before committing.
---

# AChargeX quality & testing

Run all of these and report actual output. Never claim a step passed without running it.

1. `npm run typecheck`
2. `npm test` (shared rules + OCPP end-to-end on 1.6 and 2.0.1)
3. `npm run build`
4. Start the stack: OCPP service (`npx tsx apps/ocpp/src/main.ts`) and `cd apps/web && npx vite preview`.
5. `node scripts/screens.mjs http://localhost:4173 <out>` → must print `0 overflow; 0 with errors`. Open the PNGs for changed screens at 390 and 768 (and 1440 for Control).
6. `node scripts/e2e.mjs http://localhost:4173 <out>/e2e` → all ✓ (charge flow, guest gating, QR revoke/resolve, Control reset).
7. If `supabase/` changed: `sudo bash supabase/tests/rls_check.sh` → 0 failed.

## Security review checklist
- New API route? Calls `need(p, permission)` or an ownership check before acting. Owners only touch their stations; drivers only their sessions/vehicles/payments.
- No client-trusted ownership, payment status, charger status, meter values, session totals, roles.
- No secrets in `apps/web` or `VITE_*`. Service-role key only on the OCPP server.
- Destructive operator actions behind `ConfirmDialog` and written to the audit log.
- Demo data labelled; demo payments refused on real chargers.
