import type ExcelJS from "exceljs";

/** Have the browser save a file built here. */
export function download(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An Excel file, filled by `fill`; exceljs is loaded on demand: the page does not carry it. */
export async function downloadWorkbook(fill: (workbook: ExcelJS.Workbook) => void, filename: string): Promise<void> {
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook();
  fill(workbook);
  download(await workbook.xlsx.writeBuffer(), filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export const today = () => new Date().toISOString().slice(0, 10);
