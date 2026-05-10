import { NextResponse } from 'next/server';
import { buildCSV } from '@/lib/csv';

// GET /api/contacts/template
// Returns a minimal CSV template for the MCI contact import format.
// (The /import endpoint also auto-accepts Microsoft Outlook export columns.)
export async function GET() {
  const headers = ['Name', 'Email', 'Phone', 'Firm', 'Title', 'Markets', 'Type', 'Warmth', 'Notes'];
  const example = [
    'John Smith', 'jsmith@cbre.com', '(713) 555-0142', 'CBRE', 'Senior VP',
    'Houston, Dallas', 'broker', 'hot', 'Top broker in Houston market',
  ];
  const csv = buildCSV([headers, example]);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="MCI_Contacts_Template.csv"',
    },
  });
}
