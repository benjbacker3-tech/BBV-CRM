'use client';

import { useState, useEffect } from 'react';
import { Deal, fmt } from '@/lib/utils';
import { Contact } from '@/lib/utils';

interface Props {
  deal: Deal;
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
    addText('Thank you for the opportunity to present our offer for the above referenced Property. This letter summarizes the basic business terms and conditions upon which Sandpiper Partners LLC ("Buyer") is willing to acquire the subject property.');
    addGap();

    const sections = [
      ['BUYER:', 'Sandpiper Partners LLC — Principal investor with deep experience investing in industrial and industrial outdoor storage assets across the US.'],
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
    addText('Principal, Sandpiper Partners');
    addGap(2);
    addText(`SELLER ACCEPTED AND AGREED this ________ day of _____________, 2026`);
    addText('By: ___________________________');
    addText('Authorized Signatory');

    doc.save(`LOI_${deal.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div>
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
