// UI end-to-end flows against a running stack (OCPP service + web).
// Usage: node scripts/e2e.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screenshots/e2e';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const as = async (role, id, viewport = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: true });
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.addInitScript(([role, id]) => {
    localStorage.setItem('ax.onboarded', '1');
    localStorage.setItem('ax.demoUser', JSON.stringify({ id, name: 'Maria Santos', email: 'maria@example.ph', role, isDemo: true }));
  }, [role, id]);
  return ctx;
};
const step = (m) => console.log('✓', m);
let failed = false;

try {
  // ---------- Driver: station → connector → limit → authorize → live → stop → receipt
  const ctx = await as('driver', 'demo-driver');
  const p = await ctx.newPage();
  await p.goto(`${base}/station/stn-lanang`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /AX-LNG-D101-1/ }).click();
  await p.getByRole('button', { name: /Charge on -1/ }).click();
  await p.waitForURL(/\/charge\//);
  step('connector selected → charge setup');
  await p.getByRole('radio', { name: /₱500/ }).click();
  await p.getByRole('checkbox').check();
  await p.screenshot({ path: `${out}/1-charge-setup.png` });
  await p.getByRole('button', { name: /Authorize ₱500 & start/ }).click();
  await p.waitForURL(/\/session\//);
  step('authorized → live session page');
  await p.getByText('CHARGING IN PROGRESS').waitFor({ timeout: 20000 });
  await p.waitForFunction(() => {
    const el = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim().match(/^\d+\.\d{2}$/) && s.className.includes('text-[44px]'));
    return el && parseFloat(el.textContent) > 0.05;
  }, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/2-live-session.png` });
  step('live telemetry from simulator MeterValues/TransactionEvent (kWh > 0)');
  await p.getByRole('button', { name: 'Stop charging' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Stop charging' }).click();
  await p.getByText('Charging complete').waitFor({ timeout: 20000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/3-receipt.png`, fullPage: true });
  const total = await p.locator('section[aria-label="Receipt"] .num').first().textContent();
  step(`stop → StopTransaction → receipt (total ${total})`);
  await ctx.close();

  // ---------- Guest cannot start
  const g = await as('guest', 'guest');
  const gp = await g.newPage();
  await gp.goto(`${base}/station/stn-lanang`, { waitUntil: 'networkidle' });
  await gp.getByRole('button', { name: /AX-LNG-D101-1/ }).click();
  const label = await gp.getByRole('button', { name: /Sign in to charge/ }).textContent();
  step(`guest sees "${label?.trim()}"`);
  await g.close();

  // ---------- Revoked QR
  const q = await as('driver', 'demo-driver');
  const qp = await q.newPage();
  await qp.goto(`${base}/q/demo_revoked_example_qr01`, { waitUntil: 'networkidle' });
  await qp.getByText(/withdrawn/).waitFor();
  step('revoked QR shows withdrawn message');
  await qp.goto(`${base}/q/demo_axmtnb1311_qr0001`, { waitUntil: 'networkidle' });
  await qp.waitForURL(/\/station\/stn-matina\?connector=con-mtn-b131-1/);
  step('valid QR resolves to station + connector (no session started)');
  await q.close();

  // ---------- Control: soft reset confirmed by simulator CALLRESULT
  const a = await as('admin', 'demo-admin', { width: 1440, height: 900 });
  const ap = await a.newPage();
  await ap.goto(`${base}/control/chargers/SIM-CEB-D060`, { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: /Soft reset/ }).click();
  await ap.getByRole('dialog').getByRole('button', { name: 'Send to charger' }).click();
  await ap.getByText('Accepted', { exact: true }).first().waitFor({ timeout: 15000 });
  await ap.waitForTimeout(3500);
  await ap.screenshot({ path: `${out}/4-control-reset.png` });
  step('Control soft reset → Accepted (from charger CALLRESULT)');
  await a.close();
} catch (e) {
  failed = true;
  console.error('✗', e.message);
}
await browser.close();
process.exit(failed ? 1 : 0);
