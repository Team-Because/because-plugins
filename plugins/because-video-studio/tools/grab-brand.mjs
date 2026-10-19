// node tools/grab-brand.mjs <url> <client-slug>
// Saves a brand kit from a live site: screenshots, logo candidates, colours, fonts.
// Output: clients/<slug>/brand/assets/*, clients/<slug>/brand/brand.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [url, slug] = process.argv.slice(2);
if (!url || !slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage: node tools/grab-brand.mjs <url> <client-slug (a-z, 0-9, -)>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'clients', slug, 'brand'), assets = join(dir, 'assets');
mkdirSync(assets, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
// Hide cookie / consent overlays for clean shots (hidden with CSS, never accepted or rejected)
const hideOverlays = () => page.evaluate(() => {
  const rx = /cookie|consent|gdpr|onetrust|cookiebot|truste|privacy-banner/i;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const tag = `${el.id} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('aria-label') || ''}`;
    if (rx.test(tag) || (cs.position === 'fixed' && el.textContent.length < 2000 && rx.test(el.textContent.slice(0, 400))))
      el.style.setProperty('display', 'none', 'important');
  }
});
// Sites that stream video never go network-idle: wait for load, then up to 8 s of quiet, then carry on
const settle = () => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await settle();
await hideOverlays();
await page.screenshot({ path: join(assets, 'desktop-hero.png') });
await page.screenshot({ path: join(assets, 'desktop-full.png'), fullPage: true });

const kit = await page.evaluate(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const font = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : null; };
  // Colour frequency across visible elements, weighted by area
  const tally = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 400 || r.bottom < 0) continue;
    const cs = getComputedStyle(el);
    for (const c of [cs.backgroundColor, cs.color]) {
      if (!c || c.includes('rgba(0, 0, 0, 0)')) continue;
      tally[c] = (tally[c] || 0) + (c === cs.backgroundColor ? r.width * r.height : 2000);
    }
  }
  const colors = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  const logos = new Set();
  for (const el of document.querySelectorAll('header img, nav img, a[href="/"] img, img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i]'))
    if (el.currentSrc || el.src) logos.add(abs(el.currentSrc || el.src));
  for (const l of document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]')) logos.add(abs(l.href));
  const og = document.querySelector('meta[property="og:image"]')?.content;
  // Widest inline SVG in the home link / header / nav: icons are small, wordmarks are wide
  const svgs = [...document.querySelectorAll('a[href="/"] svg, [class*="logo" i] svg, header svg, nav svg')]
    .map((s) => ({ s, w: s.getBoundingClientRect().width })).filter((x) => x.w >= 48).sort((a, b) => b.w - a.w);
  // Bake computed colours into the copy: sites often fill logos with CSS variables that don't exist elsewhere
  let svgLogo = null;
  if (svgs[0]) {
    const live = svgs[0].s, copy = live.cloneNode(true);
    const a = [live, ...live.querySelectorAll('*')], b = [copy, ...copy.querySelectorAll('*')];
    a.forEach((el, i) => {
      const cs = getComputedStyle(el);
      for (const prop of ['fill', 'stroke']) {
        const v = b[i].getAttribute(prop);
        if (v && v.includes('var(')) b[i].setAttribute(prop, cs[prop]);
      }
    });
    svgLogo = copy.outerHTML;
  }
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || null,
    fonts: { heading: font('h1') || font('h2'), body: font('body'), button: font('button, a[class*="btn" i]') },
    colors, logos: [...logos].filter(Boolean), ogImage: og ? abs(og) : null, svgLogo,
  };
});

// Mobile view
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'load', timeout: 60000 });
await settle();
await hideOverlays();
await page.screenshot({ path: join(assets, 'mobile-hero.png') });

// Download logo candidates and the share image
const files = [];
const targets = [...kit.logos.map((u, i) => [u, `logo-${i + 1}`]), ...(kit.ogImage ? [[kit.ogImage, 'og-image']] : [])];
for (const [u, name] of targets) {
  try {
    const res = await page.request.get(u, { timeout: 20000 });
    if (!res.ok()) continue;
    const type = res.headers()['content-type'] || '';
    const ext = type.includes('svg') ? 'svg' : type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg'
      : type.includes('webp') ? 'webp' : type.includes('icon') ? 'ico' : 'bin';
    const file = `${name}.${ext}`;
    writeFileSync(join(assets, file), await res.body());
    files.push({ file, from: u });
  } catch { /* skip unreachable asset */ }
}
if (kit.svgLogo) { writeFileSync(join(assets, 'logo-inline.svg'), kit.svgLogo); files.push({ file: 'logo-inline.svg', from: 'inline <svg> in header' }); }
await browser.close();

delete kit.svgLogo;
const out = { url, grabbed: new Date().toLocaleDateString('en-GB').replaceAll('/', '-'), ...kit, files };
writeFileSync(join(dir, 'brand.json'), JSON.stringify(out, null, 2));
console.log(`saved ${files.length + 3} files to ${assets}`);
console.log(JSON.stringify({ title: out.title, fonts: out.fonts, colors: out.colors.slice(0, 5) }, null, 2));
