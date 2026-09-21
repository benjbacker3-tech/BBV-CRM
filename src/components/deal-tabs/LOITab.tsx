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
    <div className="mb-6">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sent LOIs <span className="text-xs text-gray-400">(from Outlook)</span></h4>
      <div className="overflow-x-auto border border-gray-100 dark:border-gray-700 rounded">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-surface-dark text-gray-500 dark:text-gray-400">
            <tr>
              {['Sent', 'Price', '$/SF', 'SF', 'Acres', 'Deposit', 'DD / Close', 'To'].map(h => (
                <th key={h} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lois.map((l, i) => (
              <Fragment key={l.id}>
                <tr onClick={() => setOpen(open === l.id ? null : l.id)}
                    className={`cursor-pointer border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-surface-dark ${i === 0 ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{l.sent_date}</td>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap">{fmt(l.price)}</td>
                  <td className="px-2 py-1.5 font-mono">{l.price && l.sf ? `$${num(l.price / l.sf)}` : '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{num(l.sf)}</td>
                  <td className="px-2 py-1.5 font-mono">{num(l.acreage, 2)}</td>
                  <td className="px-2 py-1.5 font-mono">{fmt(l.deposit)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{l.dd_days ?? '—'} / {l.close_days ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{[l.to_name, l.to_firm].filter(Boolean).join(', ') || '—'}</td>
                </tr>
                {open === l.id && (
                  <tr className="bg-gray-50 dark:bg-surface-dark text-gray-600 dark:text-gray-400">
                    <td colSpan={8} className="px-3 py-2 space-y-1">
                      {l.version_note && <p><strong>Version:</strong> {l.version_note}</p>}
                      {l.exclusivity_days != null && <p><strong>Exclusivity:</strong> {l.exclusivity_days} days</p>}
                      {l.leaseback && <p><strong>Leaseback:</strong> {l.leaseback}</p>}
                      {l.other_terms && <p><strong>Other terms:</strong> {l.other_terms}</p>}
                      <p>
                        {l.attachment_name}
                        {l.outlook_link && <> · <a href={l.outlook_link} target="_blank" rel="noreferrer" className="text-amber underline">Open email</a></>}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <div>
      <SentLOIs dealId={deal.id} />
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Letter of Intent</h4>
        <button onClick={exportPDF} className="px-3 py-1.5 bg-amber text-white rounded text-xs hover:bg-amber-dark flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export PDF
        </button>
      </div>

      <div className="space-y-3">
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
          <div key={key}>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
            <input
              type="text"
              value={fields[key as keyof typeof fields]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
            />
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
        <h4 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Preview</h4>
        <div className="bg-gray-50 dark:bg-surface-dark rounded-lg p-4 text-xs text-gray-700 dark:text-gray-300 space-y-2 leading-relaxed">
          <p>{fields.date}</p>
          <p>{fields.sellerName}<br />{fields.sellerFirm}</p>
          <p className="font-medium">RE: {deal.address}</p>
          <p>Dear {fields.sellerName}:</p>
          <p>Thank you for the opportunity to present our offer for the above referenced Property...</p>
          <p><strong>PURCHASE PRICE:</strong> {fields.purchasePrice} ({fields.financing})</p>
          <p><strong>DEPOSIT:</strong> ${fields.deposit}</p>
          <p><strong>DUE DILIGENCE:</strong> {fields.ddDays} days</p>
          <p className="italic text-gray-400 dark:text-gray-500">This offer is not legally binding on either party.</p>
        </div>
      </div>
    </div>
  );
}
