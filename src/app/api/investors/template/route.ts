import { NextResponse } from 'next/server';
import { buildCSV } from '@/lib/csv';

// GET /api/investors/template
export async function GET() {
  const headers = ['Name', 'Type', 'Commitment', 'Called', 'Status', 'Notes'];
  const example = [
    'Meridian Capital Partners', 'Family Office', '5000000', '2000000', 'Active',
    'Lead investor. Committed to Fund I.',
  ];
  const csv = buildCSV([headers, example]);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="MCI_Investors_Template.csv"',
    },
  });
}
