// Load a page of the local CRM in headless Edge (or Chrome) and check it: console errors,
// the Daily Brief print sheets' fit, and the printed page count. Local dev only.
//
//   node scripts/page-check.mjs <url> [--pdf out.pdf] [--png out.png] [--expect-pages N] [--wait ms]
//
// e.g. with `npm run dev -- -p 3005` running:
//   node scripts/page-check.mjs http://localhost:3005/rates-brief --pdf brief.pdf --expect-pages 3
//   BRIEF_FIXTURE=path/to/brief.json (set for the dev server) + /rates-brief/fixture to test a
//   brief JSON that isn't data/rates-brief.json yet (see src/app/rates-brief/fixture/page.tsx).
//
// Signs in by minting a session cookie with the dev fallback secret from src/lib/auth.ts, so
// it only works against a dev server that has no AUTH_SECRET set. Exits 1 on any failure.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => /^https?:\/\//.test(a));
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!url) { console.error('usage: node scripts/page-check.mjs <url> [--pdf out.pdf] [--png out.png] [--expect-pages N] [--wait ms]'); process.exit(2); }
const origin = new URL(url).origin;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { console.error('Local dev servers only.'); process.exit(2); }

const SECRET = 'dev-only-secret-set-AUTH_SECRET-in-vercel';
const payload = `ben|${Date.now() + 3600_000}`;
const token = `${payload}|${createHmac('sha256', SECRET).update(payload).digest('hex')}`;

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => existsSync(p));
if (!browser) { console.error('No Edge or Chrome found.'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'page-check-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { ws?.close(); } catch { /* closed */ } proc.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ } process.exit(code); }, 500); };

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* starting */ }
}
if (!target) { console.error('Browser did not start'); done(1); }

var ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCookie', { name: 'scap_session', value: token, url: origin });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(Number(opt('--wait') || 15000));

let failed = false;
const path = await evaluate('location.pathname');
console.log('page:', path);
if (path === '/login') { console.log('FAIL: redirected to login (is AUTH_SECRET set for the dev server?)'); failed = true; }

// Daily Brief print sheets: the fit scale per page ("overflow" means trimmed past the last level).
const sheets = await evaluate("JSON.stringify([...document.querySelectorAll('.rbp-fit')].map(e => e.dataset.scale))");
if (sheets && sheets !== '[]') {
  const s = JSON.parse(sheets);
  console.log('print sheets (scale):', s.join(' | '), ' trim levels:', await evaluate("document.querySelector('.rbp-root')?.dataset.levels"));
  if (s.includes('overflow')) { console.log('FAIL: a print page still overflows after every trim'); failed = true; }
}

if (opt('--png')) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(opt('--png'), Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot ->', opt('--png'));
}
if (opt('--pdf') || opt('--expect-pages')) {
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  if (!pdf.result) { console.log('FAIL: printToPDF', JSON.stringify(pdf.error)); failed = true; }
  else {
    const buf = Buffer.from(pdf.result.data, 'base64');
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (opt('--pdf')) writeFileSync(opt('--pdf'), buf);
    console.log('printed pages:', pages, opt('--pdf') ? `-> ${opt('--pdf')}` : '');
    if (opt('--expect-pages') && pages !== Number(opt('--expect-pages'))) { console.log(`FAIL: expected ${opt('--expect-pages')} pages`); failed = true; }
  }
}

console.log('console errors:', errors.length ? '' : 'none');
for (const e of errors) console.log('  -', String(e).split('\n')[0].slice(0, 240));
if (errors.length) failed = true;
done(failed ? 1 : 0);
