import { getFieldLabel } from "./mapping.js";

const REQUIRED_FIELDS = {
  courses: ["courseCode", "courseName"],
  teachers: ["teacherName"],
  rooms: ["roomName"],
  availability: ["availability"],
  constraints: ["requirements"],
};

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function isRepeatedHeader(row, headerCells) {
  const cells = row.cells.map(normalized);
  if (!cells.some(Boolean)) return false;
  return cells.every((cell, index) => !cell || cell === normalized(headerCells[index]));
}

function getSectionCategory(row) {
  const value = [...new Set(row.cells.map(normalized).filter(Boolean))].join(" ");
  if (/^(general education courses|รายวิชาสามัญ)$/.test(value)) return "general_education";
  if (/^(department courses|รายวิชาของแผนกวิชา)$/.test(value)) return "department";
  return "";
}

function isNumericSummary(row) {
  const values = row.cells.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  return values.length === 1 && /^[\d,]+(?:\.\d+)?$/.test(values[0]);
}

export function getMappedRows(sheet, headerRow, mappings, sourceType) {
  if (!sheet) return { records: [], skipped: 0 };

  const headerCells = sheet.rows.find((row) => row.number === headerRow)?.cells ?? [];
  const requiredFields = REQUIRED_FIELDS[sourceType] ?? [];
  const records = [];
  let skipped = 0;
  let sectionCategory = "";

  for (const row of sheet.rows) {
    const category = getSectionCategory(row);
    if (row.number <= headerRow) {
      if (category) sectionCategory = category;
      continue;
    }
    if (!row.cells.some((cell) => String(cell).trim())) continue;
    if (category) {
      sectionCategory = category;
      skipped += 1;
      continue;
    }
    if (isRepeatedHeader(row, headerCells) || isNumericSummary(row)) {
      skipped += 1;
      continue;
    }

    const record = {};
    mappings.forEach((field, index) => {
      const value = String(row.cells[index] ?? "").trim();
      if (field && value) record[field] = value;
    });
    if (sourceType === "courses" && sectionCategory && !record.category) {
      record.category = sectionCategory;
    }
    if (Object.keys(record).length === 0) {
      skipped += 1;
      continue;
    }

    records.push({ sourceRow: row.number, ...record });
  }

  return { records, skipped };
}

function getAcademicYear(sheetName) {
  const match = sheetName.match(/(?:ปวช\.?\s*|year\s*)([1-3])/i);
  return match ? `vocational_year_${match[1]}` : sheetName;
}

function getGroupIds(sheet, academicYear) {
  const title = sheet.rows.slice(0, 5).flatMap((row) => row.cells).join(" ");
  const match = title.match(/([A-Za-z\u0e00-\u0e7f]+\.?\s*[1-3]\s*\/\s*)(\d+)\s*-\s*(\d+)/i);
  if (match) {
    const prefix = match[1].replace(/\s+/g, "");
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (end >= start && end - start < 10) {
      return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`);
    }
  }
  return [`${academicYear}/Group 1`, `${academicYear}/Group 2`];
}

export function validateRecords(records, sourceType) {
  const requiredFields = REQUIRED_FIELDS[sourceType] ?? [];
  if (requiredFields.length === 0) return ["Choose a data type before confirming this import."];

  const availableFields = new Set(records.flatMap((record) => Object.keys(record)));
  const unmapped = requiredFields.filter((field) => !availableFields.has(field));
  if (unmapped.length) {
    return [`Map a column to ${unmapped.map(getFieldLabel).join(" and ")} before confirming.`];
  }

  const invalidRecords = records.filter((record) => requiredFields.some((field) => !record[field]));
  if (invalidRecords.length) {
    const rows = invalidRecords.map((record) => record.sourceRow).join(", ");
    return [`Rows ${rows} are missing required ${requiredFields.map(getFieldLabel).join(" / ")} values.`];
  }
  return [];
}

export function buildWorkbookImport(extraction, settings) {
  const sheets = extraction.sheets.map((sheet) => {
    const config = settings[sheet.name];
    if (!config?.included || config.sourceType === "document") {
      return { sheetName: sheet.name, included: false, sourceType: "document", records: [], errors: [], skipped: 0 };
    }

    const mapped = getMappedRows(sheet, config.headerRow, config.mappings, config.sourceType);
    const errors = validateRecords(mapped.records, config.sourceType)
      .map((error) => `Sheet "${sheet.name}": ${error}`);
    const academicYear = getAcademicYear(sheet.name);
    const groupIds = config.sourceType === "courses" ? getGroupIds(sheet, academicYear) : [];
    const records = mapped.records.map((record) => ({
      ...record,
      sourceSheet: sheet.name,
      sourceType: config.sourceType,
      ...(config.sourceType === "courses" ? { academicYear, groupIds } : {}),
    }));

    return {
      sheetName: sheet.name,
      included: true,
      sourceType: config.sourceType,
      records,
      errors,
      skipped: mapped.skipped,
    };
  });

  return {
    sheets,
    records: sheets.flatMap((sheet) => sheet.records),
    errors: sheets.flatMap((sheet) => sheet.errors),
    skipped: sheets.reduce((total, sheet) => total + sheet.skipped, 0),
  };
}