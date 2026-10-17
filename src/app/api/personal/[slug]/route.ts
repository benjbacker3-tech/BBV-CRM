import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  return p ? NextResponse.json(p) : notFound();
}

// Only the estimated value and loan balance are edited here (they drive the equity math).
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const body = await req.json();
  const est = typeof body.est_value === 'number' && isFinite(body.est_value) ? body.est_value : p.est_value;
  const loan = typeof body.loan_balance === 'number' && isFinite(body.loan_balance) ? body.loan_balance : p.loan_balance;
  await run('UPDATE personal_properties SET est_value = ?, loan_balance = ? WHERE id = ?', [est, loan, p.id]);
  return NextResponse.json(await propertyBySlug(params.slug));
}
