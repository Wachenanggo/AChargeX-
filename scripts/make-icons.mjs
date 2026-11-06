// Renders public/images/app-icon.svg to the PNG sizes PWA/iOS/Android need.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'apps/web/public');
const svg = readFileSync(`${root}/images/app-icon.svg`, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [
  ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-512-maskable.png', 512, 0.1], ['apple-touch-icon.png', 180, 0], ['icon-1024.png', 1024, 0],
];
for (const [name, size, pad] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#111A2B;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: `${root}/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log('icons written');
