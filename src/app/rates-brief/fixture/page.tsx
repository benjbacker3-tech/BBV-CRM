import { readFileSync } from 'node:fs';
import { notFound } from 'next/navigation';
import RatesBrief from '@/components/RatesBrief';
import type { RatesBrief as Brief } from '@/lib/rates-brief';

export const dynamic = 'force-dynamic';

// Local testing only: renders the brief JSON at BRIEF_FIXTURE (e.g. a new format from the
// hosted brief) without touching data/rates-brief.json. Check it with scripts/page-check.mjs.
// Not available in production.
export default function BriefFixture() {
  const file = process.env.BRIEF_FIXTURE;
  if (process.env.NODE_ENV === 'production' || !file) notFound();
  return <RatesBrief data={JSON.parse(readFileSync(file, 'utf8')) as Brief} />;
}
