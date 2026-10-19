import { NextRequest, NextResponse } from 'next/server';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { parseStatementCsv } from '@/lib/statement-parse';
import { importStatement, readStatementPdf } from '@/lib/personal-audit';

export const maxDuration = 60;

// POST multipart { file }: a bank statement, CSV (Chase / Bank of America export) or PDF (read
// by Claude). Lines already in the ledger are linked, known payees are filed, the rest wait for
// a category on the Audit page.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a statement file' }, { status: 400 });
  const name = file.name || 'statement';
  try {
    const bytes = await file.arrayBuffer();
    const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
    const parsed = isPdf ? await readStatementPdf(bytes) : parseStatementCsv(new TextDecoder().decode(bytes));
    if (!parsed.lines.length) return NextResponse.json({ error: 'No transactions found in that file' }, { status: 400 });
    return NextResponse.json(await importStatement(p, name, isPdf ? 'pdf' : 'csv', parsed));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
