'use client';

import { useState, useEffect, Fragment } from 'react';
import { Deal, fmt } from '@/lib/utils';
import { Contact } from '@/lib/utils';

interface Props {
  deal: Deal;
}

interface SentLOI {
  id: number;
  sent_date: string;
  price: number | null;
  sf: number | null;
  acreage: number | null;
  deposit: number | null;
  dd_days: number | null;
  close_days: number | null;
  exclusivity_days: number | null;
  leaseback: string | null;
  other_terms: string | null;
  version_note: string | null;
  to_name: string | null;
  to_firm: string | null;
  attachment_name: string | null;
  outlook_link: string | null;
}

function SentLOIs({ dealId }: { dealId: number }) {
  const [lois, setLois] = useState<SentLOI[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    fetch(`/api/lois?deal_id=${dealId}`).then(r => r.json()).then(setLois).catch(() => setLois([]));
  }, [dealId]);
  if (!lois.length) return null;
  const num = (n: number | null, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d }));
  return (
    <section>
      <h4 className="section-label mb-2">
        Sent LOIs
        <span className="count">{lois.length}</span>
        <span className="pill pill-muted normal-case tracking-normal font-normal">from Outlook</span>
      </h4>
      <div className="card overflow-x-auto">
        <table className="table-clean">
          <thead>
            <tr>
              {['Sent', 'Price', '$/SF', 'SF', 'Acres', 'Deposit', 'DD / Close', 'To'].map(h => (
                <th key={h} className={['Price', '$/SF', 'SF', 'Acres', 'Deposit'].includes(h) ? '!text-right' : ''}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lois.map((l, i) => (
              <Fragment key={l.id}>
                <tr onClick={() => setOpen(open === l.id ? null : l.id)}
                    className={`row cursor-pointer ${i === 0 ? '[&>td]:font-medium [&>td]:text-slate-900 dark:[&>td]:text-slate-100' : ''}`}>
                  <td className="whitespace-nowrap font-mono tabular-nums">{l.sent_date}</td>
                  <td className="num whitespace-nowrap">{fmt(l.price)}</td>
                  <td className="num">{l.price && l.sf ? `$${num(l.price / l.sf)}` : '—'}</td>
                  <td className="num">{num(l.sf)}</td>
                  <td className="num">{num(l.acreage, 2)}</td>
                  <td className="num">{fmt(l.deposit)}</td>
                  <td className="whitespace-nowrap font-mono tabular-nums">{l.dd_days ?? '—'} / {l.close_days ?? '—'}</td>
                  <td className="whitespace-nowrap">{[l.to_name, l.to_firm].filter(Boolean).join(', ') || '—'}</td>
                </tr>
                {open === l.id && (
                  <tr>
                    <td colSpan={8} className="!bg-slate-50 dark:!bg-slate-800/50 space-y-1 leading-relaxed">
                      {l.version_note && <p><span className="font-medium text-slate-800 dark:text-slate-100">Version:</span> {l.version_note}</p>}
                      {l.exclusivity_days != null && <p><span className="font-medium text-slate-800 dark:text-slate-100">Exclusivity:</span> {l.exclusivity_days} days</p>}
                      {l.leaseback && <p><span className="font-medium text-slate-800 dark:text-slate-100">Leaseback:</span> {l.leaseback}</p>}
                      {l.other_terms && <p><span className="font-medium text-slate-800 dark:text-slate-100">Other terms:</span> {l.other_terms}</p>}
                      <p className="text-slate-500 dark:text-slate-400">
                        {l.attachment_name}
                        {l.outlook_link && <> · <a href={l.outlook_link} target="_blank" rel="noreferrer" className="text-navy dark:text-blue-300 font-medium hover:underline">Open email</a></>}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LOITab({ deal }: Props) {
  const [, setContacts] = useState<Contact[]>([]);
  const [fields, setFields] = useState({
    sellerName: '',
    sellerFirm: '',
    propertyDesc: `${deal.acreage || ''} acres`,
    purchasePrice: fmt(deal.asking_price),
    financing: 'Cash',
    deposit: '100,000',
    titleContact: 'TBD',
    ddDays: '45',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  });

  useEffect(() => {
    fetch(`/api/contacts?deal_id=${deal.id}`).then(r => r.json()).then((data: Contact[]) => {
      setContacts(data);
      const owner = data.find((c: Contact) => c.type === 'owner');
      if (owner) {
        setFields(prev => ({
          ...prev,
          sellerName: owner.name,
          sellerFirm: owner.firm || '',
        }));
      }
    });
  }, [deal.id]);

  const exportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const margin = 25;
    let y = margin;
    const lineHeight = 5.5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;

    const addText = (text: string, opts?: { bold?: boolean; size?: number; indent?: number }) => {
      const size = opts?.size || 10;
      doc.setFontSize(size);
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      const indent = opts?.indent || 0;
      const lines = doc.splitTextToSize(text, contentWidth - indent);
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = margin; }
        doc.text(line, margin + indent, y);
        y += lineHeight;
      }
    };

    const addGap = (n = 1) => { y += lineHeight * n; };

    addText(fields.date);
    addGap();
    addText(fields.sellerName);
    addText(fields.sellerFirm);
    addGap();
    addText(`RE: ${deal.address}`, { bold: true });
    addGap();
    addText(`Dear ${fields.sellerName}:`);
    addGap();
    addText('Thank you for the opportunity to present our offer for the above referenced Property. This letter summarizes the basic business terms and conditions upon which Sandpiper Capital LLC ("Buyer") is willing to acquire the subject property.');
    addGap();

    const sections = [
      ['BUYER:', 'Sandpiper Capital LLC — Principal investor with deep experience investing in industrial and industrial outdoor storage assets across the US.'],
      ['PROPERTY:', `${deal.address} — ${fields.propertyDesc}`],
      ['PURCHASE PRICE:', `${fields.purchasePrice} (${fields.financing})`],
      ['DEPOSIT:', `$${fields.deposit} due within five (5) days of PSA execution`],
      ['TITLE/ESCROW:', fields.titleContact],
      ['DUE DILIGENCE:', `Buyer will have ${fields.ddDays} days to perform its due diligence. During this time, the Seller will grant Buyer access to the Property. If Buyer determines that it is not feasible to proceed with the transaction prior to the expiration of the Inspection Period, then Buyer may cancel escrow at its sole and absolute discretion and the Deposit shall be returned to Buyer.`],
      ['CLOSING:', 'Closing will occur within thirty (30) days after end of Due Diligence.'],
      ['EXCLUSIVITY:', 'Buyer and Seller will diligently and in good faith endeavor to negotiate a purchase and sale agreement within thirty (30) days following mutual execution of this Letter of Intent. Seller agrees not to market or convey the Property to anyone other than Buyer during the Negotiation Period.'],
      ['COMMISSIONS:', 'Seller will be responsible to pay all commissions pursuant a separate agreement.'],
    ];

    for (const [label, value] of sections) {
      addText(label, { bold: true });
      addText(value, { indent: 0 });
      addGap(0.5);
    }

    addGap();
    addText('This offer is not legally binding on either party.');
    addGap();
    addText('Best Regards,');
    addText('Ben Backer');
    addText('Principal, Sandpiper Capital LLC');
    addGap(2);
    addText(`SELLER ACCEPTED AND AGREED this ________ day of _____________, 2026`);
    addText('By: ___________________________');
    addText('Authorized Signatory');

    doc.save(`LOI_${deal.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <SentLOIs dealId={deal.id} />
      <section>
      <div className="flex justify-between items-center mb-2">
        <h4 className="section-label">Letter of Intent</h4>
        <button onClick={exportPDF} className="btn-primary">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export PDF
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { key: 'date', label: 'Date' },
          { key: 'sellerName', label: 'Seller Contact Name' },
          { key: 'sellerFirm', label: 'Seller Firm' },
          { key: 'propertyDesc', label: 'Property Description' },
          { key: 'purchasePrice', label: 'Purchase Price' },
          { key: 'financing', label: 'Financing Type' },
          { key: 'deposit', label: 'Deposit Amount' },
          { key: 'titleContact', label: 'Title/Escrow Contact' },
          { key: 'ddDays', label: 'DD Period (days)' },
        ].map(({ key, label }) => (
          <div key={key} className={['date', 'propertyDesc'].includes(key) ? 'col-span-2' : ''}>
            <label className="field-label">{label}</label>
            <input
              type="text"
              value={fields[key as keyof typeof fields]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              className={`field ${['purchasePrice', 'deposit', 'ddDays'].includes(key) ? 'font-mono tabular-nums' : ''}`}
            />
          </div>
        ))}
      </div>
      </section>

      {/* Preview */}
      <section>
        <h4 className="section-label mb-2">Preview</h4>
        <div className="card card-body text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
          <p>{fields.date}</p>
          <p>{fields.sellerName}<br />{fields.sellerFirm}</p>
          <p className="font-medium">RE: {deal.address}</p>
          <p>Dear {fields.sellerName}:</p>
          <p>Thank you for the opportunity to present our offer for the above referenced Property...</p>
          <p><strong>PURCHASE PRICE:</strong> {fields.purchasePrice} ({fields.financing})</p>
          <p><strong>DEPOSIT:</strong> ${fields.deposit}</p>
          <p><strong>DUE DILIGENCE:</strong> {fields.ddDays} days</p>
          <p className="italic text-slate-400 dark:text-slate-500">This offer is not legally binding on either party.</p>
        </div>
      </section>
    </div>
  );
}
