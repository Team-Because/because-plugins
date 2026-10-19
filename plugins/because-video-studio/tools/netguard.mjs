// A pasted reference link must never reach this machine's network. Three layers:
// 1) one address check (net.BlockList: every notation, IPv4-mapped IPv6 included);
// 2) every request connects through a lookup that checks the address it actually connects to, so a
//    second DNS answer cannot differ from the checked one (no rebinding window); redirects are
//    followed by hand and each hop goes through the same path;
// 3) the headless browser never fetches by itself: guardPage fulfils every request through (2).
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const blocked = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2002::', 16]]) blocked.addSubnet(net, bits, 'ipv6');

export function privateAddress(ip) {
  const fam = isIP(ip);
  if (!fam) return true;
  if (fam === 6) {
    const m = ip.toLowerCase().match(/^::ffff:(?:([\d.]+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
    if (m) {
      const v4 = m[1] ?? [parseInt(m[2], 16) >> 8, parseInt(m[2], 16) & 255, parseInt(m[3], 16) >> 8, parseInt(m[3], 16) & 255].join('.');
      return blocked.check(v4, 'ipv4');
    }
    return blocked.check(ip, 'ipv6');
  }
  return blocked.check(ip, 'ipv4');
}

// The lookup every connection uses: refuses if any resolved address is private.
function guardedLookup(host, opts, cb) {
  dnsLookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: isIP(addrs) }];
    if (!list.length || list.some((a) => privateAddress(a.address))) return cb(new Error('That link points at a private network address.'));
    return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
}

export async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('The reference link must start with http or https.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) { if (privateAddress(host)) throw new Error('That link points at a private network address.'); return url; }
  await new Promise((ok, fail) => guardedLookup(host, {}, (e) => (e ? fail(e) : ok())));
  return url;
}

function requestOnce(url, { method = 'GET', headers = {}, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && privateAddress(host)) return reject(new Error('That link points at a private network address.'));
    const req = lib.request(url, { method, headers: { 'user-agent': 'Mozilla/5.0 (B1 Create reference reader)', ...headers }, lookup: guardedLookup, timeout: timeoutMs }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > 60 * 1024 * 1024) { req.destroy(new Error('The linked file is over 60 MB.')); } else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    // `timeout` above only fires on an idle socket; this is the hard limit for the whole response.
    const deadline = setTimeout(() => req.destroy(new Error('The link took too long to answer.')), timeoutMs);
    req.on('close', () => clearTimeout(deadline));
    req.on('timeout', () => req.destroy(new Error('The link took too long to answer.')));
    req.on('error', reject);
    req.end();
  });
}

// fetch-like: { ok, status, headers: Map-like, buffer }. Redirects followed by hand, every hop guarded.
export async function safeFetch(raw, { maxHops = 5, timeoutMs = 20000, method = 'GET', headers } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= maxHops; hop++) {
    const r = await requestOnce(url, { method, headers, timeoutMs });
    if (r.status >= 300 && r.status < 400 && r.headers.location) { url = await assertPublicUrl(new URL(r.headers.location, url).href); continue; }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, url: url.href, headers: { get: (k) => r.headers[k.toLowerCase()] ?? null }, raw: r.headers, buffer: r.body };
  }
  throw new Error('The link redirects too many times.');
}

// Playwright, whole context (covers popups and every page in it): the browser never resolves or
// connects by itself; every http(s) request goes through safeFetch, WebSockets are closed, popups are
// closed, and anything else (file:, ws:, chrome:) is refused. Contexts are created with service workers blocked.
export async function guardContext(context) {
  await context.route('**/*', async (route) => {
    const req = route.request(), u = req.url();
    if (/^(data|blob|about):/.test(u)) return route.continue();
    if (!/^https?:/.test(u)) return route.abort('blockedbyclient');
    try {
      const r = await safeFetch(u, { maxHops: 0, method: req.method() === 'HEAD' ? 'HEAD' : 'GET', headers: { accept: req.headers()['accept'] ?? '*/*' } });
      const headers = Object.fromEntries(Object.entries(r.raw).filter(([k]) => !/^(content-encoding|transfer-encoding|content-length|set-cookie)$/i.test(k)).map(([k, v]) => [k, String(v)]));
      return route.fulfill({ status: r.status, headers, body: r.buffer });
    } catch { return route.abort('blockedbyclient'); }
  });
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  await context.addInitScript(() => { Object.defineProperty(window, 'open', { value: () => null, writable: false, configurable: false }); });
  context.on('page', (pg) => { if (pg !== context.pages()[0]) pg.close().catch(() => {}); });
}
