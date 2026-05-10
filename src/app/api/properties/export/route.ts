import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { all } from '@/lib/db';
import { Deal, Stage } from '@/lib/utils';

const REPORT_STAGES: Stage[] = ['Negotiating PSA', 'LOI Submitted', 'Under Contract', 'Tracking'];
const SQFT_PER_ACRE = 43560;

// Format matching the source spreadsheet exactly:
// Row 1: blank
// Row 2: group header tier 1 (Specs, Basis)  — merged cells
// Row 3: group header tier 2 (Current, Yield-on-Cost, Total Equity, Transaction Terms)
// Row 4: column headers
// Row 5+: section headers + deal rows
// Last row: Total / Weighted Avg.

export async function GET() {
  const deals = (await all('SELECT * FROM deals')) as Deal[];
  const active = deals.filter(d => REPORT_STAGES.includes(d.stage as Stage));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCI CRM';
  wb.created = new Date();
  const ws = wb.addWorksheet('Pipeline');

  // Column widths roughly matching source
  ws.columns = [
    { width: 14 }, // A  No. / Stage label
    { width: 22 }, // B  Address
    { width: 18 }, // C  City
    { width: 16 }, // D  Market
    { width: 10 }, // E  SF
    { width: 8 },  // F  Acres
    { width: 8 },  // G  FAR
    { width: 7 },  // H  Occ %
    { width: 14 }, // I  Price
    { width: 10 }, // J  $ PLF
    { width: 9 },  // K  Initial YoC
    { width: 9 },  // L  Stab YoC
    { width: 14 }, // M  Req'd
    { width: 3 },  // N  blank
    { width: 6 },  // O  DD
    { width: 7 },  // P  Close
    { width: 10 }, // Q  Deposit
    { width: 60 }, // R  Notes
  ];

  // Default font for whole worksheet
  const body = { name: 'Calibri', size: 10 };
  const headerFont = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const groupLabelFont = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0B1A2B' } };

  const navyFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1A2B' } };
  const amberAccent: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4ECDD' } };
  const totalsFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  };

  // Row 1: blank (title spacer)
  ws.getRow(1).height = 8;

  // Row 2: Tier 1 group labels (Specs, Basis)
  ws.getCell('E2').value = 'Specs';
  ws.mergeCells('E2:H2');
  ws.getCell('I2').value = 'Basis';
  ws.mergeCells('I2:J2');

  // Row 3: Tier 2 group labels (Current, Yield-on-Cost, Total Equity, Transaction Terms)
  ws.getCell('H3').value = 'Current';
  ws.getCell('K3').value = 'Yield-on-Cost';
  ws.mergeCells('K3:L3');
  ws.getCell('M3').value = 'Total Equity';
  ws.getCell('O3').value = 'Transaction Terms';
  ws.mergeCells('O3:Q3');

  // Style rows 2 and 3 as group headers
  for (const row of [2, 3]) {
    const r = ws.getRow(row);
    r.eachCell({ includeEmpty: false }, cell => {
      cell.font = groupLabelFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF0B1A2B' } } };
    });
    r.height = 16;
  }

  // Row 4: Column headers
  const headers = ['No.', 'Address', 'City', 'Market', 'SF', 'Acres', 'FAR', 'Occ %', 'Price', '$ PLF', 'Initial', 'Stab', "Req'd", '', 'DD', 'Close', 'Deposit', 'Notes'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = navyFill;
    cell.alignment = { horizontal: i === 1 || i === 2 || i === 3 || i === 17 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  ws.getRow(4).height = 20;

  // Data rows
  let currentRow = 5;

  for (const stage of REPORT_STAGES) {
    const stageDeals = active.filter(d => d.stage === stage);
    if (stageDeals.length === 0) continue;

    // Stage section header row
    ws.getCell(currentRow, 1).value = stage;
    ws.mergeCells(currentRow, 1, currentRow, 18);
    const sectionCell = ws.getCell(currentRow, 1);
    sectionCell.font = { name: 'Calibri', size: 10, bold: true, italic: true, color: { argb: 'FF0B1A2B' } };
    sectionCell.fill = amberAccent;
    sectionCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 0 };
    ws.getRow(currentRow).height = 18;
    currentRow++;

    // Deal rows
    const startingNo = REPORT_STAGES.slice(0, REPORT_STAGES.indexOf(stage))
      .reduce((a, s) => a + active.filter(x => x.stage === s).length, 0);

    stageDeals.forEach((d, idx) => {
      const landSF = (d.acreage || 0) * SQFT_PER_ACRE;
      const far = landSF > 0 ? (d.sf || 0) / landSF : 0;
      const plf = landSF > 0 ? (d.asking_price || 0) / landSF : 0;
      const no = startingNo + idx + 1;

      const row = ws.getRow(currentRow);
      row.values = [
        no,
        d.address,
        d.city,
        d.market,
        d.sf || 0,
        d.acreage || 0,
        far,
        d.occupancy || 0,
        d.asking_price || 0,
        plf,
        d.yoc_initial || 0,
        d.yoc_target || 0,
        d.equity_required || 0,
        null, // blank col N
        d.dd_days || null,
        d.close_days || null,
        d.deposit || 0,
        d.notes || '',
      ];
      applyBodyStyles(row, body);
      currentRow++;
    });
  }

  // Total / Weighted Avg row
  if (active.length > 0) {
    const totalSF = active.reduce((s, d) => s + (d.sf || 0), 0);
    const totalAcres = active.reduce((s, d) => s + (d.acreage || 0), 0);
    const totalPrice = active.reduce((s, d) => s + (d.asking_price || 0), 0);
    const totalEquity = active.reduce((s, d) => s + (d.equity_required || 0), 0);
    const totalDeposit = active.reduce((s, d) => s + (d.deposit || 0), 0);
    const totalLandSF = totalAcres * SQFT_PER_ACRE;
    const wFar = totalLandSF > 0 ? totalSF / totalLandSF : 0;
    const wOcc = active.length > 0 ? active.reduce((s, d) => s + (d.occupancy || 0), 0) / active.length : 0;
    const wPlf = totalLandSF > 0 ? totalPrice / totalLandSF : 0;
    const wInitial = totalPrice > 0 ? active.reduce((s, d) => s + (d.yoc_initial || 0) * (d.asking_price || 0), 0) / totalPrice : 0;
    const wStab = totalPrice > 0 ? active.reduce((s, d) => s + (d.yoc_target || 0) * (d.asking_price || 0), 0) / totalPrice : 0;

    const row = ws.getRow(currentRow);
    row.values = [
      'Total / Weighted Avg.',
      null, null, null,
      totalSF, totalAcres, wFar, wOcc,
      totalPrice, wPlf, wInitial, wStab, totalEquity,
      null, null, null, totalDeposit, null,
    ];
    applyBodyStyles(row, body);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...body, bold: true };
      cell.fill = totalsFill;
      cell.border = {
        ...thinBorder,
        top: { style: 'medium', color: { argb: 'FF0B1A2B' } },
        bottom: { style: 'double', color: { argb: 'FF0B1A2B' } },
      };
    });
    // Label cell spans A-D aesthetically (but keep cells separate for simplicity)
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  }

  // Apply number formats to data/total columns
  applyNumberFormats(ws, 5, currentRow);

  // Freeze panes so headers stay visible
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().split('T')[0];
  const filename = `MCI_Acq_Pipeline_${today.replace(/-/g, '_')}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function applyBodyStyles(row: ExcelJS.Row, font: { name: string; size: number }) {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font = { ...font };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
    };
    // Alignment by column
    const leftAlign = [2, 3, 4, 18]; // Address, City, Market, Notes
    cell.alignment = {
      horizontal: leftAlign.includes(col) ? 'left' : 'right',
      vertical: 'middle',
      wrapText: col === 18,
    };
  });
  row.height = 18;
}

function applyNumberFormats(ws: ExcelJS.Worksheet, startRow: number, endRow: number) {
  // Column index → format
  const fmts: Record<number, string> = {
    5: '#,##0',           // SF
    6: '0.00',            // Acres
    7: '0.00',            // FAR
    8: '0%',              // Occ %
    9: '$#,##0',          // Price
    10: '$#,##0.00',      // $ PLF
    11: '0.0%',           // Initial YoC
    12: '0.0%',           // Stab YoC
    13: '$#,##0',         // Req'd
    15: '0',              // DD days
    16: '0',              // Close days
    17: '$#,##0',         // Deposit
  };
  for (let r = startRow; r <= endRow; r++) {
    for (const [col, fmt] of Object.entries(fmts)) {
      const cell = ws.getCell(r, Number(col));
      // Don't format the stage section header rows (they merge across — cell value is a string)
      if (typeof cell.value === 'number') {
        cell.numFmt = fmt;
      }
    }
  }
}
