// Screenshot + horizontal-overflow audit of the real rendered app at all target viewports.
// Usage: node scripts/screens.mjs <baseUrl> <outDir> [filter]
// Map tiles are stubbed with a flat tile ONLY when the network blocks OSM (sandbox); real browsers load real tiles.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screenshots';
const filter = process.argv[4];
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  [320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900],
];
const ROUTES = [
  { name: 'welcome', path: '/welcome', user: null },
  { name: 'signin', path: '/signin', user: null },
  { name: 'home', path: '/', user: 'driver' },
  { name: 'find-map', path: '/find', user: 'driver', wait: 1500 },
  { name: 'find-list', path: '/find?view=list', user: 'driver' },
  { name: 'station', path: '/station/stn-matina', user: 'driver' },
  { name: 'charge-setup', path: '/charge/con-mtn-b131-1', user: 'driver' },
  { name: 'garage', path: '/garage', user: 'driver' },
  { name: 'wallet', path: '/wallet', user: 'driver' },
  { name: 'scan', path: '/scan', user: 'driver' },
  { name: 'network', path: '/network', user: 'owner' },
  { name: 'network-station', path: '/network/stations/stn-matina', user: 'owner' },
  { name: 'network-new', path: '/network/stations/new', user: 'owner' },
  { name: 'control', path: '/control', user: 'admin' },
  { name: 'control-chargers', path: '/control/chargers', user: 'admin' },
  { name: 'control-charger', path: '/control/chargers/SIM-MTN-B131', user: 'admin' },
];
const IDS = { driver: 'demo-driver', owner: 'demo-owner', admin: 'demo-admin', operator: 'demo-operator' };

// 1x1 light map tile
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACwElEQVR4nO3TMQ0AIADAMMC/VkKCAWRwrFWwZ3PfM6Bq/Q6AnwxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgDQDkGYA0gxAmgFIMwBpBiDNAKQZgLQHeIIE0ZAWllMAAAAASUVORK5CYII=', 'base64');

const browser = await chromium.launch();
const report = [];
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: w < 1024, isMobile: w < 768 });
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  for (const r of ROUTES) {
    if (filter && !r.name.includes(filter)) continue;
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !m.text().includes('tile') && errors.push(m.text()));
    await page.addInitScript(([user, id]) => {
      localStorage.setItem('ax.onboarded', '1');
      if (user) localStorage.setItem('ax.demoUser', JSON.stringify({ id, name: 'Maria Santos', email: 'maria@example.ph', role: user, isDemo: true }));
      else localStorage.removeItem('ax.demoUser');
    }, [r.user, IDS[r.user] ?? '']);
    await page.goto(base + r.path, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(r.wait ?? 700);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    const overflow = m.sw > m.iw + 1;
    // offenders: elements wider than viewport
    let offenders = [];
    if (overflow) {
      offenders = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
      );
    }
    await page.screenshot({ path: `${out}/${r.name}-${w}.png`, fullPage: false });
    report.push({ route: r.name, viewport: `${w}x${h}`, overflow, offenders, errors: errors.slice(0, 3) });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.overflow || r.errors.length);
console.log(`${report.length} screenshots; ${report.filter((r) => r.overflow).length} overflow; ${report.filter((r) => r.errors.length).length} with errors`);
for (const b of bad) console.log(JSON.stringify(b));
