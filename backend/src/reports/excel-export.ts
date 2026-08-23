import type { Response } from 'express';
import ExcelJS from 'exceljs';

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  // 'date'/'money' задают формат ячейки в Excel — money всегда в рублях (2 знака после
  // запятой), date — русский формат dd.mm.yyyy (те же данные, что уже отображает UI).
  format?: 'date' | 'money';
  value: (row: T) => string | number | Date | null;
}

// Общий рендер отчёта в .xlsx — переиспользуется всеми экспортами reports.controller.ts
// (см. вызовы ниже). Один лист на файл, шапка жирным + автоширина по колонкам, дальше
// строки как есть — форматирование внутри Excel через numFmt, не через строковый вывод,
// чтобы получатель мог сортировать/суммировать колонки как числа/даты, а не текст.
export async function sendExcelReport<T>(
  res: Response,
  filenameBase: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DormProj';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.header,
    width: c.width ?? 18,
    style: c.format === 'money' ? { numFmt: '#,##0.00 ₽' } : c.format === 'date' ? { numFmt: 'dd.mm.yyyy' } : undefined,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(columns.map((c) => c.value(row)));
  }

  const buffer = await workbook.xlsx.writeBuffer();

  // Content-Disposition — только Latin1/ASCII в filename= (см. contracts.controller.ts,
  // тот же баг ERR_INVALID_CHAR на кириллице), ASCII-заглушка + filename* по RFC 5987/6266.
  const asciiFallback = `${filenameBase}.xlsx`.replace(/[^\x20-\x7E]/g, '_');
  const utf8Name = encodeURIComponent(`${sheetName}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Name}`);
  res.send(Buffer.from(buffer));
}
