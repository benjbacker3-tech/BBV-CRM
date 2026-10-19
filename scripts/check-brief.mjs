// Checks data/rates-brief.json before every build (npm "prebuild"). The Daily Brief file is
// written unattended each weekday; if it's malformed the build stops here with a plain reason
// and Vercel keeps serving the last good deploy, instead of failing somewhere inside Next.
//
//   node scripts/check-brief.mjs [path]      (default data/rates-brief.json)
//
// Only checks what the CRM needs to render. Text fields may be strings or lists (the CRM reads
// both), so those aren't policed here.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'data/rates-brief.json';
const problems = [];
let B;
try {
  B = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Daily Brief check: ${file} is not valid JSON (${e.message}).`);
  process.exit(1);
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
if (!isObj(B)) problems.push('the file must hold one JSON object');
else {
  for (const k of ['headline', 'dateline']) if (typeof B[k] !== 'string' || !B[k].trim()) problems.push(`"${k}" must be a non-empty string`);
  for (const k of ['tape', 'key', 'freight', 'series']) if (!Array.isArray(B[k])) problems.push(`"${k}" must be a list`);
  for (const k of ['rundown', 'cal', 'econ', 'top', 'sports', 'board']) if (k in B && B[k] != null && !Array.isArray(B[k])) problems.push(`"${k}" must be a list when present`);
  for (const k of ['dive', 'reading', 'focus', 'world']) if (k in B && B[k] != null && !isObj(B[k])) problems.push(`"${k}" must be an object when present`);
  if (Array.isArray(B.series)) {
    if (B.series.length < 250) problems.push(`"series" has ${B.series.length} rows; it should hold years of daily yields (was it trimmed?)`);
    const bad = B.series.findIndex(r => !Array.isArray(r) || typeof r[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r[0]));
    if (bad >= 0) problems.push(`"series" row ${bad} isn't [YYYY-MM-DD, 2Y, 5Y, 10Y]`);
  }
  if (Array.isArray(B.key)) B.key.forEach((k, i) => { if (!isObj(k) || typeof k.n !== 'string') problems.push(`"key" item ${i} needs a name ("n")`); });
  if (Array.isArray(B.tape)) B.tape.forEach((t, i) => { if (!isObj(t) || typeof t.n !== 'string') problems.push(`"tape" item ${i} needs a name ("n")`); });
  if (Array.isArray(B.cal)) B.cal.forEach((c, i) => { if (!isObj(c) || (c.d && !/^\d{4}-\d{2}-\d{2}$/.test(c.d))) problems.push(`"cal" item ${i} needs an ISO date ("d")`); });
}

if (problems.length) {
  console.error(`Daily Brief check failed for ${file}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Daily Brief check: ok (${B.dateline})`);
