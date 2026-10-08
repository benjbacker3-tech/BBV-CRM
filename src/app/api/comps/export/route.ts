import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { all } from '@/lib/db';
import { Comp, ColKey, MARKETS, compMetrics, layoutFor } from '@/lib/comps';

export const dynamic = 'force-dynamic';

const FONT = 'Arial';
const NAVY = 'FF1E3A5F';

const FMT: Partial<Record<ColKey, string>> = {
  date: 'm/d/yyyy', avail_date: 'm/d/yyyy', sf: '#,##0', acres: '0.00', cvg: '0.0%',
  rent: '$#,##0', price: '$#,##0', alt_price: '$#,##0', acre_mo: '$#,##0', door_mo: '$#,##0',
  bsf_yr: '$#,##0.00', sale_plf: '$#,##0.00', lsf_mo: '$0.00', nnn: '$0.00', gross: '$0.00',
  bumps: '0.0%', term: '0', tom: '0.0', doors: '0', depth: '0',
};

const toDate = (s: string | null) => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

type CellValue = ExcelJS.CellValue;

// A derived column becomes a live formula when its inputs are also columns in
// the section; otherwise it's written as a plain value.
function cellFor(key: ColKey, comp: Comp, idx: number, col: (k: ColKey) => string | null, r: number): CellValue {
  const m = compMetrics(comp);
  const ref = (k: ColKey) => { const L = col(k); return L ? `${L}${r}` : null; };
  const guard = (inputs: (string | null)[], expr: string, result: number | null): CellValue => {
    if (inputs.some(x => !x)) return result;
    return { formula: `IFERROR(IF(OR(${inputs.map(x => `${x}=""`).join(',')}),"",${expr}),"")`, result: result ?? '' };
  };
  const sf = ref('sf'), acres = ref('acres'), rent = ref('rent'), price = ref('price'), doors = ref('doors');
  switch (key) {
    case 'no': return idx + 1;
    case 'date': return toDate(comp.comp_date) ?? comp.status ?? null;
    case 'avail_date': return toDate(comp.available_date);
    case 'status': return comp.status;
    case 'address': return comp.address;
    case 'city': return comp.city;
    case 'submarket': return comp.submarket;
    case 'landlord': return comp.landlord;
    case 'tenant': return comp.tenant;
    case 'buyer': return comp.buyer;
    case 'seller': return comp.seller;
    case 'broker': return comp.broker;
    case 'zoning': return comp.zoning;
    case 'yard': return comp.yard;
    case 'fence': return comp.fence;
    case 'lit': return comp.lit;
    case 'details': return comp.notes;
    case 'type': return comp.property_type;
    case 'marketing': return comp.marketing;
    case 'occupancy': return comp.occupancy_note;
    case 'sf': return comp.sf;
    case 'acres': return comp.acres;
    case 'doors': return comp.doors;
    case 'depth': return comp.depth;
    case 'rent': return m.rentMonthly;
    case 'price': return comp.price;
    case 'alt_price': return comp.alt_price;
    case 'nnn': return comp.nnn_plf;
    case 'bumps': return comp.bumps;
    case 'term': return comp.term_months;
    case 'cvg': return guard([sf, acres], `${sf}/(${acres}*43560)`, m.coverage);
    case 'lsf_mo': return rent ? guard([rent, acres], `${rent}/(${acres}*43560)`, m.rentLsfMo) : m.rentLsfMo;
    case 'bsf_yr': return guard([rent, sf], `${rent}*12/${sf}`, m.rentBsfYr);
    case 'acre_mo': return guard([rent, acres], `${rent}/${acres}`, m.rentAcreMo);
    case 'door_mo': return guard([rent, doors], `${rent}/${doors}`, m.rentDoorMo);
    case 'sale_plf': return guard([price, acres], `${price}/(${acres}*43560)`, m.priceLsf);
    case 'gross': {
      const plf = ref('lsf_mo'), nnn = ref('nnn');
      return guard([plf, nnn], `${plf}+${nnn}`, m.grossLsfMo);
    }
    case 'tom': {
      const ad = ref('avail_date');
      if (ad && comp.available_date) return { formula: `IF(${ad}="","",(TODAY()-${ad})/30.4375)`, result: m.tomMonths ?? '' };
      return m.tomMonths;
    }
  }
}

export async function GET() {
  const comps = await all<Comp>(
    `SELECT * FROM comps WHERE review_status = 'approved'
     ORDER BY (comp_date IS NULL), comp_date DESC, (available_date IS NULL), available_date DESC, id DESC`
  );

  const markets = [...MARKETS, ...Array.from(new Set(comps.map(c => c.market || 'Other'))).filter(m => !MARKETS.includes(m)).sort()];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sandpiper Capital CRM';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  for (const market of markets) {
    const inMarket = comps.filter(c => (c.market || 'Other') === market);
    const ws = wb.addWorksheet(market.slice(0, 31), { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 2;
    let r = 2;

    for (const section of layoutFor(market)) {
      const rows = inMarket.filter(c => c.kind === section.kind);
      const letter = (i: number) => ws.getColumn(i + 2).letter;
      const col = (k: ColKey) => { const i = section.cols.findIndex(x => x.key === k); return i >= 0 ? letter(i) : null; };

      // Title
      const title = ws.getCell(r, 2);
      title.value = section.title;
      title.font = { name: FONT, size: 11, bold: true, color: { argb: NAVY } };
      r++;

      // Group band: "Size" over SF, band label over the first $ column
      const sfIdx = section.cols.findIndex(x => x.key === 'sf');
      const moneyIdx = section.cols.findIndex(x => ['rent', 'price', 'lsf_mo'].includes(x.key));
      if (sfIdx >= 0) ws.getCell(r, sfIdx + 2).value = 'Size';
      if (moneyIdx >= 0 && section.band) ws.getCell(r, moneyIdx + 2).value = section.band;
      ws.getRow(r).font = { name: FONT, size: 9, italic: true, color: { argb: 'FF666666' } };
      r++;

      // Header
      section.cols.forEach((cl, i) => {
        const cell = ws.getCell(r, i + 2);
        cell.value = cl.label;
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'middle' };
      });
      r++;

      // Data
      rows.forEach((comp, idx) => {
        section.cols.forEach((cl, i) => {
          const cell = ws.getCell(r, i + 2);
          cell.value = cellFor(cl.key, comp, idx, col, r);
          cell.font = { name: FONT, size: 10 };
          const fmt = FMT[cl.key];
          if (fmt) cell.numFmt = fmt;
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFD0D0D0' } } };
        });
        r++;
      });
      if (!rows.length) {
        ws.getCell(r, 3).value = '—';
        ws.getCell(r, 3).font = { name: FONT, size: 10, color: { argb: 'FF999999' } };
        r++;
      }
      r += 2;
    }

    // Widths: generous for text, compact for numbers
    const widest = Math.max(...layoutFor(market).map(s => s.cols.length));
    for (let i = 0; i < widest; i++) {
      const key = layoutFor(market).map(s => s.cols[i]?.key).find(Boolean);
      ws.getColumn(i + 2).width = key === 'address' ? 24 : ['landlord', 'tenant', 'buyer', 'seller', 'broker', 'details'].includes(String(key)) ? 20 : 12;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="West Region Tracking - ${today}.xlsx"`,
    },
  });
}
