import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? "").join("");
  }
  if (typeof value.text === "string") return value.text;
  if (Object.hasOwn(value, "result")) return cellToText(value.result);
  if (typeof value.hyperlink === "string") return value.text ?? value.hyperlink;
  return "";
}

async function readWorkbook(file) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets = workbook.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push({
        number: row.number,
        cells: row.values.slice(1).map(cellToText),
      });
    });
    return { name: sheet.name, rows };
  });

  return {
    kind: "workbook",
    fileName: file.name,
    fileSize: file.size,
    sheets,
  };
}

async function readPdf(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ number: pageNumber, text });
  }

  const characterCount = pages.reduce((total, page) => total + page.text.length, 0);
  return {
    kind: "pdf",
    fileName: file.name,
    fileSize: file.size,
    pages,
    likelyScanned: characterCount < Math.max(40, pages.length * 12),
  };
}

export async function inspectFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("This file is larger than 25 MB. Choose a smaller file.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return readWorkbook(file);
  if (extension === "pdf") return readPdf(file);
  if (extension === "xls") {
    throw new Error("Legacy .xls files are not supported yet. Save the workbook as .xlsx and try again.");
  }
  throw new Error("Choose an .xlsx workbook or a .pdf document.");
}
