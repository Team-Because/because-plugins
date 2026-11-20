// The storyboard page of a reel cut from footage (tools/reel-kit.mjs storyboard, B1-brief path). Editors look, they do not
// read (20-11-2026): the page is the stop. At the top the reference and our rough cut play side by side, in sync, over a
// beat strip; below, one card per beat with the reference and our take moving, the on-screen words on the take as they will
// sit, and a gap drawn as a dashed "shoot this" frame. The longer notes stay folded under Details.
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RATIO = { '9x16': '9/16', '1x1': '1/1', '16x9': '16/9', '4x5': '4/5' };
const KIND = { footage: 'Our footage', still: 'Our photo', generated: 'Generated shot', code: 'Built from brand assets', gap: 'Gap' };
const ICON = {
  gap: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  code: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 15h10M7 11h6" stroke="currentColor" stroke-width="1.6"/></svg>',
};

// beats: [{ t: [a, b], line, kind, label, shoot, refImg, refClip, takeImg, takeClip, reference_shows, role, client_shows }]
export function storyboardHtml({ title, fmt = '9x16', refCut, ourCut, beats }) {
  const ratio = RATIO[fmt] ?? '9/16', end = Math.max(...beats.map((b) => b.t[1])), gaps = beats.filter((b) => b.kind === 'gap').length;
  const media = (clip, img) => clip ? `<video src="${esc(clip)}" poster="${esc(img ?? '')}" muted loop autoplay playsinline preload="metadata"></video>`
    : img ? `<img src="${esc(img)}" alt="">` : '';
  const strip = beats.map((b, i) => `<button class="seg k-${b.kind}" style="flex:${(b.t[1] - b.t[0]).toFixed(3)}" data-t="${b.t[0]}" title="Beat ${i + 1}">${i + 1}</button>`).join('');
  const cards = beats.map((b, i) => {
    const n = String(i + 1).padStart(2, '0');
    const take = b.kind === 'gap' ? `<div class="ph gap">${ICON.gap}<b>Shoot this</b><span>${esc(b.shoot)}</span></div>`
      : b.kind === 'code' && !b.takeImg ? `<div class="ph code">${ICON.code}<b>Brand card</b></div>`
      : media(b.takeClip, b.takeImg);
    return `<article class="card k-${b.kind}" data-a="${b.t[0]}" data-b="${b.t[1]}">
<header><span class="n">${n}</span><span class="chip">${b.t[0].toFixed(1)}–${b.t[1].toFixed(1)} s</span><span class="kind">${esc(KIND[b.kind] ?? b.kind)}</span></header>
<div class="pair"><figure><div class="frame">${media(b.refClip, b.refImg)}</div><figcaption>Reference</figcaption></figure>
<figure><div class="frame">${take}${b.line && b.kind !== 'gap' ? `<p class="words">${esc(b.line)}</p>` : ''}</div><figcaption>${esc(b.label ?? '')}</figcaption></figure></div>
<details><summary>Details</summary><dl><dt>Role</dt><dd>${esc(b.role)}</dd><dt>Reference shows</dt><dd>${esc(b.reference_shows)}</dd><dt>Our take shows</dt><dd>${esc(b.client_shows)}</dd></dl></details>
</article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reel Storyboard</title>
<style>
:root{--bg:#f2f1ee;--card:#fff;--fg:#141413;--mut:#6b6a66;--line:#dedcd6;--acc:#2f6fe4;--gap:#c4342b;--code:#8a8780}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e0e0d;--card:#191917;--fg:#eeece6;--mut:#9b9992;--line:#2c2b28;--acc:#7aa5ff;--gap:#ff8a80;--code:#77746c}}
:root[data-theme="dark"]{--bg:#0e0e0d;--card:#191917;--fg:#eeece6;--mut:#9b9992;--line:#2c2b28;--acc:#7aa5ff;--gap:#ff8a80;--code:#77746c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 18px}.sub b{color:var(--gap)}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:${fmt === '16x9' ? 1180 : 620}px}.hero figure{margin:0}.hero .frame{border-radius:12px}
.frame{position:relative;aspect-ratio:${ratio};background:#000;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.frame video,.frame img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{font-size:12px;color:var(--mut);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{display:flex;align-items:center;gap:12px;margin:14px 0 6px;max-width:${fmt === '16x9' ? 1180 : 620}px}
.play{border:0;border-radius:999px;background:var(--acc);color:#fff;font:600 14px system-ui;padding:9px 18px;cursor:pointer}
.strip{position:relative;display:flex;gap:3px;flex:1;height:34px}.seg{border:0;border-radius:6px;font:600 12px ui-monospace,monospace;color:#fff;cursor:pointer;min-width:18px;background:var(--acc)}
.seg.k-gap{background:repeating-linear-gradient(45deg,var(--gap) 0 6px,transparent 6px 11px);color:var(--gap);border:1.5px solid var(--gap)}.seg.k-code{background:var(--code)}.seg.k-generated{background:#8b5cf6}
.head{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--fg);left:0;pointer-events:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${fmt === '16x9' ? 520 : 330}px,1fr));gap:16px;margin-top:28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;transition:box-shadow .2s}.card.now{box-shadow:0 0 0 2px var(--acc)}.card.k-gap{border-color:var(--gap)}
.card header{display:flex;align-items:center;gap:8px;margin-bottom:10px}.n{font:700 14px ui-monospace,monospace}.chip{font:12px ui-monospace,monospace;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:1px 8px}.kind{margin-left:auto;font-size:12px;color:var(--mut)}.k-gap .kind{color:var(--gap);font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pair figure{margin:0}
.words{position:absolute;left:8%;right:8%;bottom:16%;margin:0;text-align:center;color:#fff;font:700 clamp(12px,1.6vw,17px)/1.2 system-ui;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 12px rgba(0,0,0,.5)}
.ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;text-align:center;font-size:13px;background:var(--card)}
.ph.gap{color:var(--gap);border:2px dashed var(--gap);border-radius:10px}.ph.code{color:var(--code)}.ph b{font-size:15px}
details{margin-top:8px;font-size:13px;color:var(--mut)}summary{cursor:pointer}dl{margin:6px 0 0}dt{font-size:11px;text-transform:uppercase;letter-spacing:.06em}dd{margin:0 0 6px;color:var(--fg)}
@media (max-width:640px){.hero{grid-template-columns:1fr 1fr;gap:8px}.grid{grid-template-columns:1fr}}
</style>
<div class="wrap"><h1>${esc(title)}</h1><p class="sub">${beats.length} beats, ${end.toFixed(1)} s${gaps ? ` · <b>${gaps} gap${gaps > 1 ? 's' : ''} to shoot</b>` : ' · every beat has a take'}</p>
<div class="hero"><figure><div class="frame"><video id="ref" src="${esc(refCut)}" muted playsinline preload="auto"></video></div><figcaption>Reference</figcaption></figure>
<figure><div class="frame"><video id="ours" src="${esc(ourCut)}" muted playsinline preload="auto"></video></div><figcaption>Our rough cut (takes only, words come later)</figcaption></figure></div>
<div class="bar"><button class="play" id="play">Play both</button><div class="strip" id="strip">${strip}<i class="head" id="head"></i></div></div>
<div class="grid">${cards}</div></div>
<script>
const r=document.getElementById('ref'),o=document.getElementById('ours'),b=document.getElementById('play'),h=document.getElementById('head'),END=${end};
const cards=[...document.querySelectorAll('.card')];
const seek=(t)=>{r.currentTime=t;o.currentTime=t;};
b.onclick=()=>{if(o.paused){if(o.ended||o.currentTime>=END-0.05)seek(0);o.play();r.play();b.textContent='Pause';}else{o.pause();r.pause();b.textContent='Play both';}};
o.onended=()=>{r.pause();b.textContent='Play again';};
document.querySelectorAll('.seg').forEach((s)=>s.onclick=()=>seek(+s.dataset.t));
(function tick(){const t=o.currentTime;h.style.left=Math.min(100,t/END*100)+'%';if(!o.paused&&Math.abs(r.currentTime-t)>0.15)r.currentTime=t;
cards.forEach((c)=>c.classList.toggle('now',t>=+c.dataset.a&&t<+c.dataset.b&&t>0));requestAnimationFrame(tick);})();
</script></html>`;
}
