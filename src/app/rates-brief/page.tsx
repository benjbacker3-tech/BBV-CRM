import RatesBrief from '@/components/RatesBrief';
import type { RatesBrief as Brief } from '@/lib/rates-brief';
import brief from '../../../data/rates-brief.json';

// The Morning Rates Brief task rewrites data/rates-brief.json each weekday and pushes it;
// the deploy that follows picks up the new file.
export default function RatesBriefPage() {
  return <RatesBrief data={brief as unknown as Brief} />;
}
