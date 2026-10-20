// Renders data/rates-brief.json as the standalone three-page Daily Brief web page that is
// published to Ben's shared brief link (the page the morning email points to).
//
//   node scripts/render-brief-html.mjs [in.json] [out.html]
//   defaults: data/rates-brief.json -> .brief/daily-brief.html (git-ignored)
//
// Plain Node, no dependencies. Every section drops out when its data is missing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const inFile = process.argv[2] || 'data/rates-brief.json';
const outFile = process.argv[3] || '.brief/daily-brief.html';
const B = JSON.parse(readFileSync(inFile, 'utf8'));

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Body HTML from the brief: keep only p, b, strong, i, em, br and http(s) links; drop everything else.
const safe = s => String(s ?? '')
  .replace(/<(?!\/?(p|b|strong|i|em|br)\b[^>]*>)(?!a\s+href="https?:\/\/[^"]*"[^>]*>)(?!\/a>)[^>]*>/gi, '')
  .replace(/<(p|b|strong|i|em|br)\b[^>]*>/gi, '<$1>')
  .replace(/<a\s+href="(https?:\/\/[^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener">');
const has = v => v != null && v !== '' && !(Array.isArray(v) && !v.length);
const arr = v => (Array.isArray(v) ? v : []);
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const rateCls = n => (n > 0 ? 'dn' : n < 0 ? 'upc' : 'std');   // rising rates/costs = red
const mktCls = n => (n > 0 ? 'upc' : n < 0 ? 'dn' : 'std');    // rising prices = green
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isoDate = s => new Date(s + 'T12:00:00Z');
const shortD = s => { const d = isoDate(s); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const dowD = s => { const d = isoDate(s); return `${DOW[d.getUTCDay()]} ${shortD(s)}`; };
const runDay = (B.dateline || '').split(' · ')[0];
const runIso = (() => { const d = new Date(runDay + ' 12:00 UTC'); return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10); })();
const addDays = (iso, n) => { const d = isoDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mast = (brand, n, extra) => `<div class="mast"><div class="brand">Sandpiper · ${brand}</div><div class="date">Page ${n} · ${esc(extra)}</div></div>`;

// ---------- charts ----------
function lineChart(seriesList, { w, h, padL = 34, padR = 62, padT = 8, padB = 22, xLabels = [], yFmt = v => v.toFixed(1), endLabels = [] }) {
  const all = seriesList.flatMap(s => s.pts.map(p => p[1])).filter(v => typeof v === 'number');
  if (!all.length) return '';
  let lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1; lo -= span * 0.08; hi += span * 0.08;
  const n = Math.max(...seriesList.map(s => s.pts.length));
  const X = i => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const Y = v => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const step = [0.25, 0.5, 1, 2, 5, 10].find(s => (hi - lo) / s <= 4) || 10;
  let out = `<svg viewBox="0 0 ${w} ${h}">`;
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
    out += `<line x1="${padL}" x2="${w - padR}" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}" style="stroke:var(--line)"/><text x="${padL - 5}" y="${(Y(g) + 3).toFixed(1)}" text-anchor="end" font-size="9" style="fill:var(--faint)" font-family="JetBrains Mono,monospace">${yFmt(g)}</text>`;
  }
  for (const [i, t] of xLabels) out += `<text x="${X(i).toFixed(1)}" y="${h - 4}" font-size="9" style="fill:var(--faint)" text-anchor="middle">${esc(t)}</text>`;
  for (const s of seriesList) {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    out += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="${s.wd || 1.6}"/>`;
  }
  // end labels, nudged apart so they never overlap
  const labs = endLabels.map(l => ({ ...l, y: Y(l.v) + 3 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 11) labs[i].y = labs[i - 1].y + 11;
  for (const l of labs) out += `<text x="${w - padR + 5}" y="${l.y.toFixed(1)}" font-size="9.5" font-weight="600" style="fill:${l.color}" font-family="JetBrains Mono,monospace">${esc(l.t)}</text>`;
  return out + '</svg>';
}

function yieldChart() {
  const S = arr(B.series).filter(r => Array.isArray(r) && r.length >= 4);
  if (S.length < 20) return '';
  const last = S[S.length - 1][0];
  const from = addDays(last, -365);
  const yr = S.filter(r => r[0] >= from);
  const xLabels = [];
  yr.forEach((r, i) => { const d = isoDate(r[0]); if ([0, 3, 6, 9].includes(d.getUTCMonth()) && (i === 0 || isoDate(yr[i - 1][0]).getUTCMonth() !== d.getUTCMonth()) && i > 5) xLabels.push([i, `${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`]); });
  const cols = [{ k: 1, n: '2Y', color: '#9DB8D9' }, { k: 2, n: '5Y', color: '#4F80BD' }, { k: 3, n: '10Y', color: 'var(--navy)', wd: 2 }];
  const svg = lineChart(cols.map(c => ({ color: c.color, wd: c.wd, pts: yr.map(r => [r[0], r[c.k]]) })), {
    w: 520, h: 128, xLabels,
    endLabels: cols.map(c => ({ v: yr[yr.length - 1][c.k], color: c.color, t: `${c.n} ${yr[yr.length - 1][c.k].toFixed(2)}` })),
  });
  return `<div class="ct">2-, 5- and 10-year Treasury yields, past year</div>${svg}<div class="src">U.S. Treasury par yields, latest ${esc(B.ustDate || shortD(last))}</div>`;
}

function focusChart(c) {
  const pts = arr(c?.pts).filter(p => typeof p[1] === 'number');
  if (pts.length < 3) return '';
  const unit = c.unit || '';
  const lastV = pts[pts.length - 1][1];
  const xl = [[0, pts[0][0]], [Math.floor((pts.length - 1) / 2), pts[Math.floor((pts.length - 1) / 2)][0]], [pts.length - 1, pts[pts.length - 1][0]]];
  return `<div class="ct">${esc(c.t)}</div>` + lineChart([{ color: 'var(--navy)', wd: 1.8, pts }], {
    w: 340, h: 92, padL: 26, padR: 40, xLabels: xl, yFmt: v => v.toFixed(1),
    endLabels: [{ v: lastV, color: 'var(--navy)', t: `${lastV}${unit}` }],
  });
}

function realChart(r) {
  const pts = arr(r?.pts).filter(p => typeof p[1] === 'number');
  if (!pts.length) return '';
  const max = Math.max(...pts.map(p => Math.abs(p[1]))) || 1;
  const zero = 160.3, half = 117, rowH = 16.5;
  let out = `<svg viewBox="0 0 330 ${pts.length * rowH + 18}"><line x1="${zero}" x2="${zero}" y1="2" y2="${pts.length * rowH + 2}" style="stroke:var(--muted)"/>`;
  pts.forEach(([n, v], i) => {
    const y = 5 + i * rowH, wd = Math.max(1.5, (Math.abs(v) / max) * half);
    const x = v >= 0 ? zero : zero - wd;
    out += `<text x="72" y="${y + 8}" text-anchor="end" font-size="10" style="fill:var(--ink2)">${esc(n)}</text><rect x="${x.toFixed(1)}" y="${y}" width="${wd.toFixed(1)}" height="10" rx="2" style="fill:var(--navy)" opacity="${v >= 0 ? 1 : 0.45}"/>`;
    out += v >= 0
      ? `<text x="${(zero + wd + 4).toFixed(1)}" y="${y + 8}" font-size="9.5" font-family="JetBrains Mono,monospace" style="fill:var(--ink)">+${v.toFixed(2)}</text>`
      : `<text x="${(zero - wd - 4).toFixed(1)}" y="${y + 8}" text-anchor="end" font-size="9.5" font-family="JetBrains Mono,monospace" style="fill:var(--ink)">−${Math.abs(v).toFixed(2)}</text>`;
  });
  return out + `<text x="${zero}" y="${pts.length * rowH + 15}" text-anchor="middle" font-size="9" style="fill:var(--faint)">0 = rates match inflation</text></svg>`;
}

// ---------- page 1 ----------
function page1() {
  let h = `<div class="page">${mast('Daily Brief', 1, B.dateline)}<h1>${esc(B.headline)}</h1>`;
  const key = arr(B.key);
  if (key.length) {
    const cards = key.map(k => {
      const d = [['1M', k.d1m], ['6M', k.d6m], ['1Y', k.d1y]].filter(([, v]) => typeof v === 'number')
        .map(([l, v]) => `<span>${l}</span><span class="${rateCls(v)}">${sign(v)}</span>`).join('');
      return `<div class="card"><div class="lbl">${esc(k.n)}</div><div class="v num">${Number(k.cur).toFixed(2)}%</div><div class="d num">${d}</div>${k.asof ? `<div class="asof">as of ${esc(k.asof)}</div>` : ''}</div>`;
    }).join('');
    h += `<h2>Rates <span class="sub">Δ in basis points</span></h2><div class="r1"><div class="cards">${cards}</div><div>${yieldChart()}</div></div>`;
  }
  const econ = arr(B.econ);
  if (econ.length) h += `<div class="econ">${econ.map(e => `<span><span class="lbl">${esc(e.n)}</span> <b class="num">${esc(e.v)}</b> <span class="small">${esc(e.d)}</span></span>`).join('')}</div>`;
  const tape = arr(B.tape);
  if (tape.length) {
    h += `<h2>Markets <span class="sub">close · day · 1 year</span></h2><div class="tape" style="grid-template-columns:repeat(${Math.min(tape.length, 5)},1fr)">` + tape.map(t => {
      const cls = t.rate ? rateCls(t.c) : mktCls(t.c);
      const ycls = t.rate ? rateCls(t.y) : mktCls(t.y);
      return `<div><div class="lbl">${esc(t.n)}${t.asof ? ` <span class="small">${esc(t.asof)}</span>` : ''}</div><div class="v num">${esc(t.v)}</div><div class="c num">${t.ctext ? `<span>Day</span><span class="${cls}">${esc(t.ctext)}</span>` : ''}${t.ytext ? `<span>1Y</span><span class="${ycls}">${esc(t.ytext)}</span>` : ''}</div>${t.why ? `<p>${esc(t.why)}</p>` : ''}</div>`;
    }).join('') + '</div>';
  }
  const rd = arr(B.rundown).filter(r => r && r.h);
  if (rd.length) h += `<h2>The Rundown</h2><ol class="rd">${rd.map(r => `<li><div><span class="tag">${esc(r.tag)}</span><p><b>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.h)}</a>` : esc(r.h)}</b> ${esc(r.p)}</p></div></li>`).join('')}</ol>`;
  const fr = arr(B.freight);
  if (fr.length) h += `<h2>Freight &amp; supply chain</h2><div class="tape t3">${fr.map(f => `<div><div class="lbl">${esc(f.n)}</div><div class="v num">${esc(f.v)}</div><div class="c num">${f.pc ? `<span>${esc(f.pl || 'Day')}</span><span>${esc(f.pc)}</span>` : ''}${f.y ? `<span>1Y</span><span>${esc(f.y)}</span>` : ''}</div>${f.why ? `<p>${esc(f.why)}</p>` : ''}</div>`).join('')}</div>`;
  if (has(B.sport)) h += `<div class="sport"><b>Sports</b> ${esc(B.sport)}</div>`;
  return h + '</div>';
}

// ---------- page 2 ----------
function page2() {
  const D = B.dive, F = arr(B.focus?.items);
  const cal = arr(B.cal).filter(c => c && c.d && c.d >= runIso).sort((a, b) => a.d.localeCompare(b.d));
  if (!D && !F.length && !cal.length) return '';
  let h = `<div class="page">${mast('Daily Brief', 2, runDay)}`;
  if (D) {
    h += `<h2>Deep dive${D.kicker ? ` <span class="sub">${esc(D.kicker)}</span>` : ''}</h2><h3>${esc(D.title)}</h3><div class="cols2">${safe(D.body)}</div>`;
    const T = D.table, W = arr(D.watch);
    if (T?.rows?.length || W.length) {
      h += `<div class="two dt"><div>${T?.rows?.length ? `<div class="cap">${esc(T.cap || '')}</div><div class="tw"><table><tr>${arr(T.cols).map(c => `<th>${esc(c)}</th>`).join('')}</tr>${T.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : ''}</div>`;
      h += W.length ? `<div class="watch"><span class="lbl">What to watch</span><ul>${W.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '<div></div>';
      h += '</div>';
    }
  }
  for (const f of F) {
    const actCls = f.good === true ? 'upc' : f.good === false ? 'dn' : '';
    h += `<h2>Data in focus${f.rel ? ` <span class="sub">${esc(f.rel)}</span>` : ''}</h2><h3>${esc(f.title)}</h3>`;
    h += `<div class="rel">${f.act ? `<span>Actual <b class="${actCls}">${esc(f.act)}</b></span>` : ''}${f.cons ? `<span>Consensus <b>${esc(f.cons)}</b></span>` : ''}${f.prior ? `<span>Prior <b>${esc(f.prior)}</b></span>` : ''}</div>`;
    const ex = arr(f.experts);
    h += `<div class="two"><div>${safe(f.body)}</div><div>${focusChart(f.chart)}${ex.length ? `<ul class="xp">${ex.map(e => `<li><b>${esc(e.who)}:</b> ${esc(e.view)}</li>`).join('')}</ul>` : ''}${f.lean ? `<div class="lean"><span class="lbl">Where experts lean</span> ${esc(f.lean)}</div>` : ''}</div></div>`;
  }
  if (cal.length) {
    const weekOut = addDays(runIso, 7);
    const week = cal.filter(c => c.d <= weekOut), later = cal.filter(c => c.d > weekOut);
    h += `<h2>Calendar</h2><div class="two calw">`;
    h += `<div><div class="cap">This week · consensus · prior</div><div class="tw"><table class="cal"><tr><th>Date</th><th>Release</th><th class="num">Cons.</th><th class="num">Prior</th></tr>${week.map(c => `<tr><td>${dowD(c.d)}</td><td class="e">${esc(c.e)}</td><td class="num">${esc(c.act ?? c.cons ?? '')}</td><td class="num">${esc(c.prior ?? '')}</td></tr>`).join('')}</table></div></div>`;
    h += later.length ? `<div><div class="cap">Later</div><div class="tw"><table class="cal"><tr><th>Date</th><th>Event</th><th>Why it matters</th></tr>${later.slice(0, 8).map(c => `<tr><td>${dowD(c.d)}</td><td class="e">${esc(c.e)}</td><td class="w">${esc(c.why || '')}</td></tr>`).join('')}</table></div></div>` : '<div></div>';
    h += '</div>';
  }
  return h + '</div>';
}

// ---------- page 3 ----------
function page3() {
  const W = B.world, R = B.reading;
  if (!W && !R) return '';
  let h = `<div class="page">${mast('World Desk', 3, runDay)}`;
  if (W?.lead) {
    const L = W.lead;
    h += `<h2>The big picture${L.kicker ? ` <span class="sub">${esc(L.kicker)}</span>` : ''}</h2><h3>${esc(L.title)}</h3>${safe(L.body)}`;
    if (L.reach) h += `<div class="reach"><b>How it reaches you:</b> ${esc(L.reach)}</div>`;
    const V = arr(L.views);
    if (V.length) h += `<div class="views">${V.map(v => `<div><span class="who">${esc(v.who)}:</span> ${esc(v.view)}</div>`).join('')}</div>`;
  }
  const hot = arr(W?.hot);
  if (hot.length) h += `<h2>Hotspot tracker</h2><div class="tw"><table><tr><th>Region</th><th>What changed</th><th>Trend</th><th>Market channel</th><th>Next date</th></tr>${hot.map(x => `<tr><td>${esc(x.r)}</td><td>${esc(x.chg)}</td><td><span class="pill ${['esc', 'eas', 'std'].includes(x.tc) ? x.tc : 'std'}">${esc(x.trend)}</span></td><td>${esc(x.ch)}</td><td>${esc(x.next)}</td></tr>`).join('')}</table></div>`;
  const cb = arr(W?.cb);
  if (cb.length || W?.real) {
    h += '<div class="two">';
    h += `<div>${cb.length ? `<h2>Central bank watch <span class="sub">ex-Fed</span></h2><ul class="cb">${cb.map(c => `<li><span class="d">${c.d ? shortD(c.d) : ''}</span><span><b>${esc(c.bank)}</b>, ${esc(c.rate)}: ${esc(c.exp)}</span></li>`).join('')}</ul>` : ''}</div>`;
    h += `<div>${W?.real ? `<h2>${esc(W.real.t || "Who's really tight?")} <span class="sub">policy rate minus CPI</span></h2>${realChart(W.real)}` : ''}</div>`;
    h += '</div>';
  }
  if (R) {
    h += `<div class="corner"><h2>Investor's Corner <span class="sub">${esc([R.kind, R.who].filter(Boolean).join(' · '))}</span></h2><h3 style="font-size:13px">${esc(R.title)}</h3>${R.dek ? `<p class="dek">${esc(R.dek)}</p>` : ''}<div class="cbody">${safe(R.body)}</div>`;
    const tk = arr(R.takeaways);
    if (tk.length) h += `<ul class="tk">${tk.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    if (R.src) h += `<div class="src">${esc(R.src)}</div>`;
    h += '</div>';
  }
  return h + '</div>';
}

// ---------- document ----------
const CSS = readFileSync(new URL('./brief-page.css', import.meta.url), 'utf8');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sandpiper Daily Brief</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>${CSS}</style></head><body>
<div class="bar"><span class="t">${esc(runDay)}</span><div class="seg" role="group" aria-label="Theme"><button type="button" id="th-light" data-t="light">Light</button><button type="button" id="th-dark" data-t="dark">Dark</button></div></div>
${page1()}${page2()}${page3()}
<script>
(function(){var r=document.documentElement,K='sp-brief-theme';
function sys(){return window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
function set(t,save){r.setAttribute('data-theme',t);['light','dark'].forEach(function(x){var b=document.getElementById('th-'+x);if(b)b.setAttribute('aria-pressed',x===t?'true':'false');});if(save){try{localStorage.setItem(K,t);}catch(e){}}}
var s=null;try{s=localStorage.getItem(K);}catch(e){}
set(s||sys(),false);
document.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){set(b.getAttribute('data-t'),true);});});
})();
</script>
</body></html>
`;
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`Daily Brief page: ${outFile} (${(html.length / 1024).toFixed(0)} KB, ${runDay})`);
