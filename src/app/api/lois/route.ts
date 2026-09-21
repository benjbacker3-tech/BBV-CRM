import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';

// GET /api/lois?deal_id=123 → LOIs sent for a deal, newest first.
// GET /api/lois            → all LOIs (with deal name), newest first.
export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (dealId) {
    return NextResponse.json(await all('SELECT * FROM lois WHERE deal_id = ? ORDER BY sent_date DESC, id DESC', [dealId]));
  }
  return NextResponse.json(await all(
    'SELECT l.*, d.name AS deal_name, d.stage AS deal_stage FROM lois l LEFT JOIN deals d ON d.id = l.deal_id ORDER BY l.sent_date DESC, l.id DESC'
  ));
}
