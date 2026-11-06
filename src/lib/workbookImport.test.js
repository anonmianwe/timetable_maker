import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { getFieldsForSource, guessSourceType, suggestColumnMappings, suggestHeaderRow } from "./mapping.js";
import { buildWorkbookImport } from "./workbookImport.js";

function valueToText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
  if (Object.hasOwn(value, "result")) return valueToText(value.result);
  if (typeof value.text === "string") return value.text;
  return String(value);
}

async function loadImportFixture(fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(new URL(`../../base/${fileName}`, import.meta.url));
  const extraction = {
    sheets: workbook.worksheets.map((worksheet) => {
      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        rows.push({ number: row.number, cells: row.values.slice(1).map(valueToText) });
      });
      return { name: worksheet.name, rows };
    }),
  };
  const settings = Object.fromEntries(extraction.sheets.map((sheet) => {
    const sourceType = guessSourceType(sheet.name);
    const headerRow = suggestHeaderRow(sheet.rows, sourceType);
    const headers = sheet.rows.find((row) => row.number === headerRow)?.cells ?? [];
    const columnCount = sheet.rows.reduce((max, row) => Math.max(max, row.cells.length), headers.length);
    const headerCells = Array.from({ length: columnCount }, (_, index) => headers[index] ?? "");
    return [sheet.name, {
      sourceType,
      included: sourceType !== "document",
      headerRow,
      mappings: suggestColumnMappings(headerCells, sourceType),
      fields: getFieldsForSource(sourceType),
    }];
  }));
  return { extraction, settings };
}

test("workbook import combines included sheets and excludes unchecked sheets", () => {
  const extraction = {
    sheets: [
      {
        name: "Year 1",
        rows: [
          { number: 1, cells: ["Course Code", "Course Name"] },
          { number: 2, cells: ["A-101", "Intro to Electronics"] },
        ],
      },
      {
        name: "Teachers",
        rows: [
          { number: 1, cells: ["Teacher Name", "Position"] },
          { number: 2, cells: ["Teacher A", "Department Head"] },
        ],
      },
      {
        name: "Notes",
        rows: [{ number: 1, cells: ["Imported for reference only"] }],
      },
    ],
  };
  const result = buildWorkbookImport(extraction, {
    "Year 1": { included: true, sourceType: "courses", headerRow: 1, mappings: ["courseCode", "courseName"] },
    Teachers: { included: true, sourceType: "teachers", headerRow: 1, mappings: ["teacherName", "position"] },
    Notes: { included: false, sourceType: "document", headerRow: 1, mappings: [] },
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].sourceSheet, "Year 1");
  assert.equal(result.records[1].sourceSheet, "Teachers");
  assert.deepEqual(result.errors, []);
  assert.equal(result.sheets.find((sheet) => sheet.sheetName === "Notes").included, false);
});

test("course section labels and repeated headers are skipped, but incomplete course rows fail validation", () => {
  const extraction = {
    sheets: [{
      name: "Year 1",
      rows: [
        { number: 1, cells: ["Course Code", "Course Name"] },
        { number: 2, cells: ["General Education Courses"] },
        { number: 3, cells: ["Course Code", "Course Name"] },
        { number: 4, cells: ["A-101", "Intro to Electronics"] },
        { number: 5, cells: ["A-102", ""] },
      ],
    }],
  };
  const result = buildWorkbookImport(extraction, {
    "Year 1": { included: true, sourceType: "courses", headerRow: 1, mappings: ["courseCode", "courseName"] },
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.skipped, 2);
  assert.match(result.errors[0], /Rows 5 are missing required/);
});

test("numeric-only workbook total rows are not imported as course records", () => {
  const extraction = {
    sheets: [{
      name: "Year 1",
      rows: [
        { number: 1, cells: ["Course Code", "Course Name", "Hours", "Course Type"] },
        { number: 2, cells: ["A-101", "Intro to Electronics", "4", "Practical"] },
        { number: 3, cells: ["", "", "", "50"] },
      ],
    }],
  };
  const result = buildWorkbookImport(extraction, {
    "Year 1": { included: true, sourceType: "courses", headerRow: 1, mappings: ["courseCode", "courseName", "hours", "courseType"] },
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, []);
});

for (const fileName of ["data.xlsx", "data_en.xlsx"]) {
  test(`${fileName} imports recognized sheets without validation errors`, async () => {
    const { extraction, settings } = await loadImportFixture(fileName);
    const result = buildWorkbookImport(extraction, settings);
    const courseSheets = result.sheets.filter((sheet) => sheet.sourceType === "courses");
    const teacherSheets = result.sheets.filter((sheet) => sheet.sourceType === "teachers");

    assert.equal(courseSheets.length, 3);
    assert.equal(teacherSheets.length, 1);
    assert.equal(result.errors.length, 0, result.errors.join("\n"));
    assert.ok(result.records.length >= 30, `Expected course and teacher records, got ${result.records.length}`);
    assert.ok(result.records.some((record) => record.courseCode));
    assert.ok(result.records.some((record) => record.teacherName));
    const courses = result.records.filter((record) => record.sourceType === "courses");
    assert.ok(courses.some((course) => course.category === "general_education"));
    assert.ok(courses.some((course) => course.category === "department"));
    assert.ok(courses.every((course) => course.academicYear.startsWith("vocational_year_")));
    assert.ok(courses.every((course) => course.groupIds.length === 2));
    const groupsByYear = new Map();
    for (const course of courses) {
      groupsByYear.set(course.academicYear, new Set([...(groupsByYear.get(course.academicYear) ?? []), ...course.groupIds]));
    }
    assert.equal(groupsByYear.size, 3);
    assert.ok([...groupsByYear.values()].every((groups) => groups.size === 2));
    assert.equal(new Set([...groupsByYear.values()].flatMap((groups) => [...groups])).size, 6);
  });
}