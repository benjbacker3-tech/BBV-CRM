import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { SYNC_TAB_NAME, SYNC_FIELDS, numFmt } from '@/lib/excel-sync';

// GET /api/properties/template
// Returns a .xlsx with a single tab called "MCI Pipeline" that users copy into
// each of their deal models (right-click the tab → Move or Copy → Create a copy
// → select their workbook). The CRM reads this tab on drag-and-drop import.
export async function GET() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCI CRM';
  wb.created = new Date();

  const ws = wb.addWorksheet(SYNC_TAB_NAME, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: 'FFBA7517' } },
  });

  // Styles
  const navy = { argb: 'FF0B1A2B' };
  const amber = { argb: 'FFBA7517' };
  const lightGrey = { argb: 'FFF5F5F5' };
  const midGrey = { argb: 'FFBBBBBB' };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: midGrey },
    bottom: { style: 'thin', color: midGrey },
    left: { style: 'thin', color: midGrey },
    right: { style: 'thin', color: midGrey },
  };

  // Column widths
  ws.getColumn(1).width = 26;  // Field
  ws.getColumn(2).width = 32;  // Value
  ws.getColumn(3).width = 60;  // Note

  // Row 1: Title band
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value = 'MCI CRM Sync';
  title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: navy };
  title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;

  // Row 2: Instructions
  ws.mergeCells('A2:C2');
  const instr = ws.getCell('A2');
  instr.value = 'Fill in Column B. Do not modify Column A labels. Drop this workbook into the CRM at /properties to sync.';
  instr.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
  instr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 18;

  // Row 3: blank spacer
  ws.getRow(3).height = 6;

  // Row 4: Column headers
  const headerRow = ws.getRow(4);
  headerRow.values = ['Field', 'Value', 'Notes'];
  headerRow.eachCell({ includeEmpty: false }, cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: amber };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.border = thinBorder;
  });
  headerRow.height = 20;

  // Rows 5+: each field
  SYNC_FIELDS.forEach((f, idx) => {
    const rowNum = 5 + idx;
    const row = ws.getRow(rowNum);

    const fieldCell = row.getCell(1);
    fieldCell.value = f.field;
    fieldCell.font = { name: 'Calibri', size: 10, bold: true, color: navy };
    fieldCell.fill = { type: 'pattern', pattern: 'solid', fgColor: lightGrey };
    fieldCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    fieldCell.border = thinBorder;
    // Protect the label text so users don't accidentally rename it (best-effort —
    // they'd still need to enable sheet protection in Excel for it to stick)
    fieldCell.protection = { locked: true };

    const valueCell = row.getCell(2);
    // Leave empty — users fill this in. Only show placeholder format.
    const fmt = numFmt(f.kind);
    if (fmt) valueCell.numFmt = fmt;
    valueCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0000EE' } };  // blue = input (IB convention)
    valueCell.border = thinBorder;
    valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    valueCell.protection = { locked: false };

    const noteCell = row.getCell(3);
    noteCell.value = f.note || '';
    noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };
    noteCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    noteCell.border = thinBorder;

    row.height = 20;
  });

  // Add a bottom spacer + legend
  const legendRow = 5 + SYNC_FIELDS.length + 1;
  ws.mergeCells(legendRow, 1, legendRow, 3);
  const legend = ws.getCell(legendRow, 1);
  legend.value = 'Tip: copy this tab into any of your deal models via right-click → Move or Copy → check "Create a copy".';
  legend.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } };
  legend.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="MCI_CRM_Sync_Template.xlsx"',
    },
  });
}
