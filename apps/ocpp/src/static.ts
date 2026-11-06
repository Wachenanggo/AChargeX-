/**
 * Optional static hosting of the built web app (apps/web/dist) from the same server,
 * so the whole platform can run as ONE free service at ONE URL (no CORS, no second host).
 * SPA fallback to index.html; hashed assets cached forever; gzip for text assets.
 */
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

export function createStaticHandler(dir: string) {
  const root = resolve(dir);
  const cache = new Map<string, { body: Buffer; gz?: Buffer; type: string }>();

  async function load(file: string) {
    let hit = cache.get(file);
    if (hit) return hit;
    const body = await readFile(file);
    const ext = extname(file).toLowerCase();
    hit = { body, type: TYPES[ext] ?? 'application/octet-stream', gz: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body) : undefined };
    if (body.length < 5_000_000) cache.set(file, hit);
    return hit;
  }

  async function resolveFile(pathname: string): Promise<string | null> {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) return null; // path traversal guard
    try {
      const s = await stat(file);
      return s.isFile() ? file : null;
    } catch {
      return null;
    }
  }

  /** Returns true if the request was handled. */
  return async function serve(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    if (pathname.startsWith('/api/') || pathname.startsWith('/ocpp/')) return false;

    let file = pathname === '/' ? null : await resolveFile(pathname);
    let spa = false;
    if (!file) {
      // Unknown asset-looking paths are real 404s; everything else is an app route.
      if (/\.[a-z0-9]{2,8}$/i.test(pathname)) return false;
      file = join(root, 'index.html');
      spa = true;
    }
    let f;
    try {
      f = await load(file);
    } catch {
      return false;
    }
    const name = file.slice(root.length);
    const immutable = name.startsWith(`${sep}assets${sep}`);
    const noCache = spa || name.endsWith('index.html') || name.endsWith('sw.js') || name.includes('workbox-') || name.endsWith('.webmanifest');
    const gz = f.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, {
      'Content-Type': f.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : noCache ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(gz ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : gz ? f.gz : f.body);
    return true;
  };
}
