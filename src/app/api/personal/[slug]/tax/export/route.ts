import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { all } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { auditYear, taxYear } from '@/lib/personal-audit';
import { PersonalTx, monthLabel } from '@/lib/personal';

export const dynamic = 'force-dynamic';

// GET ?year= → an Excel workbook for the CPA: the Schedule E summary, every ledger entry, and
// the monthly audit status.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const y = req.nextUrl.searchParams.get('year') || '';
  const year = /^\d{4}$/.test(y) ? y : String(new Date().getFullYear());
  const [s, tx, months] = await Promise.all([
    taxYear(p, year),
    all<PersonalTx>('SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date', [p.id, year]),
    auditYear(p, year),
  ]);

  const wb = new ExcelJS.Workbook();
  const usd = '"$"#,##0.00;[Red]-"$"#,##0.00';
  const bold = { bold: true };

  const sum = wb.addWorksheet('Schedule E');
  sum.columns = [{ width: 46 }, { width: 18 }];
  sum.addRow([`${p.name} · ${p.address || ''}`]).font = { bold: true, size: 13 };
  sum.addRow([`Tax year ${year}${p.entity ? ` · ${p.entity}` : ''}`]);
  sum.addRow([]);
  const line = (label: string, v: number | null, strong = false) => { const r = sum.addRow([label, v]); r.getCell(2).numFmt = usd; if (strong) r.font = bold; };
  sum.addRow(['Income']).font = bold;
  line('Rents received', s.rents);
  if (s.otherIncome) line('Other income', s.otherIncome);
  sum.addRow([]);
  sum.addRow(['Expenses']).font = bold;
  line(`Mortgage interest${s.interestFrom1098 ? ' (Form 1098)' : ' (ESTIMATE: enter the 1098 figure)'}`, s.mortgageInterest);
  line('Taxes (property)', s.taxes);
  line('Insurance', s.insurance);
  line(`Utilities, net of tenant reimbursements (${s.utilitiesPaid.toFixed(2)} paid − ${s.recharges.toFixed(2)} reimbursed)`, s.utilitiesNet);
  line('Repairs and maintenance', s.repairs);
  if (s.bankFees) line('Bank fees', s.bankFees);
  if (s.other) line('Other', s.other);
  line('Total expenses', s.totalExpenses, true);
  sum.addRow([]);
  line('Net rental income (before depreciation)', s.net, true);
  if (s.share) line(`Ben's share (${s.share.pct}%)`, s.share.net, true);
  sum.addRow([]);
  sum.addRow(['Not deductible / for reference']).font = bold;
  line('Mortgage payments made (principal, interest and escrow)', s.mortgagePaid);
  line('Owner contributions', s.owner.contributions);
  line('Owner draws', s.owner.draws);
  if (s.note) { line("Dan's note: interest received", s.note.interest); line("Dan's note: principal received", s.note.principal); }
  sum.addRow([]);
  sum.addRow([`Months audited and closed: ${s.monthsClosed} of 12`]);

  const t = wb.addWorksheet('Transactions');
  t.columns = [{ header: 'Date', width: 12 }, { header: 'Description', width: 52 }, { header: 'Category', width: 20 }, { header: 'Type', width: 10 }, { header: 'Amount', width: 14 }, { header: 'Source', width: 18 }, { header: 'Notes', width: 40 }];
  t.getRow(1).font = bold;
  for (const x of tx) { const r = t.addRow([x.date, x.description, x.category, x.type, x.type === 'Expense' ? -x.amount : x.amount, x.source || '', x.notes || '']); r.getCell(5).numFmt = usd; }

  const a = wb.addWorksheet('Monthly audit');
  a.columns = [{ header: 'Month', width: 18 }, { header: 'Status', width: 12 }, { header: 'Income', width: 14 }, { header: 'Expenses', width: 14 }, { header: 'Notes', width: 50 }];
  a.getRow(1).font = bold;
  for (const m of months) { const r = a.addRow([monthLabel(m.month), m.state, m.income, m.expense, m.notes || '']); r.getCell(3).numFmt = usd; r.getCell(4).numFmt = usd; }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${p.name} ${year} tax summary.xlsx"`,
    },
  });
}
