// Opens a film page for the studio tools. Two modes:
// - default (Aman's /motion films, trusted code): file:// as before.
// - sandbox (FILM_SANDBOX_ROOTS set, used by the B1 Create worker for model-written pages): no file
//   access at all. The page is served from http://film.local, which answers only for files inside the
//   allowed folders, with the Content-Security-Policy as a response header (no network, no frames,
//   no workers). Service workers and WebSockets are blocked and popups are closed. Anything else
//   the page asks for, including file:// and every other host, is refused.
import { chromium } from 'playwright';
import { readFileSync, realpathSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'http://film.local';
export const CSP_HEADER = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'self'";
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

const roots = () => (process.env.FILM_SANDBOX_ROOTS ? JSON.parse(process.env.FILM_SANDBOX_ROOTS).map((r) => realpathSync(r) + sep) : null);
export const sandboxed = () => Boolean(process.env.FILM_SANDBOX_ROOTS);
// Where a file on disk lives inside the sandbox origin.
export const urlFor = (abs) => ORIGIN + pathToFileURL(abs).pathname;

function inside(abs, allowed) {
  try { const r = realpathSync(abs); return allowed.some((root) => r.startsWith(root)); } catch { return false; }
}

export async function launch() {
  // Metal is macOS only; Linux (CI, the hosted renderer later) uses Chromium's default backend.
  const args = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [];
  if (!sandboxed()) args.push('--allow-file-access-from-files');
  return chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args });
}

// Seal a context: only the sandbox origin, only allowed files, header CSP, no SW/WS/popups.
export async function sealContext(context, allowed) {
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort('blockedbyclient');
    const abs = decodeURIComponent(u.pathname);
    if (!inside(abs, allowed)) return route.fulfill({ status: 404, body: '' });
    const type = TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream';
    return route.fulfill({ status: 200, body: readFileSync(abs), headers: { 'content-type': type, 'content-security-policy': CSP_HEADER, 'x-content-type-options': 'nosniff' } });
  });
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  // Runs before any page script, even one placed before <head>: no new windows, and it cannot be restored.
  await context.addInitScript(() => { Object.defineProperty(window, 'open', { value: () => null, writable: false, configurable: false }); });
  context.on('page', (pg) => { if (pg !== context.pages()[0]) pg.close().catch(() => {}); });
}

// Returns a Playwright page at the film, ready for seek(t). query is '?fmt=1x1' or ''. setup(p) runs
// before navigation, so error listeners see load-time errors too.
export async function openFilm(browser, page, viewport, query = '', setup = () => {}) {
  const allowed = roots();
  if (!allowed) {
    const p = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    setup(p);
    await p.goto(pathToFileURL(resolve(page)).href + query);
    return p;
  }
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await sealContext(context, allowed);
  const p = await context.newPage();
  setup(p);
  await p.goto(urlFor(resolve(page)) + query);
  return p;
}
