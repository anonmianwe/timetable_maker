import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { getFieldsForSource, guessSourceType, suggestColumnMappings, suggestHeaderRow } from "./mapping.js";
import { buildWorkbookImport } from "./workbookImport.js";
import { generateTimetable } from "./scheduler.js";

function valueToText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
  if (Object.hasOwn(value, "result")) return valueToText(value.result);
  if (typeof value.text === "string") return value.text;
  return String(value);
}

async function loadThaiWorkbookRecords() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(new URL("../../base/data.xlsx", import.meta.url));
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
  return buildWorkbookImport(extraction, settings).records;
}

function makeFixture() {
  const records = [];
  const courseDurations = [...Array(10).fill(2), ...Array(5).fill(1)];
  courseDurations.forEach((hours, index) => {
    records.push({
      sourceType: "courses",
      courseCode: `P-${index + 1}`,
      courseName: `Practical course ${index + 1}`,
      hours: String(hours),
      courseType: "Practical",
      category: "department",
      academicYear: "vocational_year_2",
      groupIds: ["TC.2/1", "TC.2/2"],
      roomRequirement: "Use a computer room",
      requirements: "",
    });
  });
  for (const name of ["A", "B", "C", "D", "E"]) {
    records.push({ sourceType: "teachers", teacherName: `Teacher ${name}`, position: "Teacher", availability: "" });
  }
  return records;
}

test("scheduler produces a conflict-free full-week timetable for two groups", () => {
  const result = generateTimetable({
    records: makeFixture(),
    options: { enforceTeacherWorkload: false, maxPlacementAttempts: 3 },
  });

  assert.equal(result.status, "feasible", result.errors.join("\n"));
  assert.match(result.algorithm, /bounded MRV constraint search/i);
  assert.equal(result.schedule.length, 30);
  assert.deepEqual(result.errors, []);
  for (const groupId of ["TC.2/1", "TC.2/2"]) {
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      assert.ok(result.schedule.some((lesson) => lesson.groupIds.includes(groupId) && lesson.day === day && lesson.periods.includes(1)));
    }
  }
});

test("scheduler rejects fixed periods that do not match course duration", () => {
  const records = [
    {
      sourceType: "courses",
      courseCode: "FIX-1",
      courseName: "Fixed course",
      hours: "3",
      courseType: "Theory",
      category: "department",
      academicYear: "vocational_year_2",
      groupIds: ["TC.2/1", "TC.2/2"],
      roomRequirement: "Use a computer room",
      requirements: "Scheduled Monday, periods 1-2",
    },
    { sourceType: "teachers", teacherName: "Teacher A", position: "Department Head", availability: "" },
  ];

  const result = generateTimetable({ records });
  assert.equal(result.status, "invalid_input");
  assert.match(result.errors[0], /do not match the 3-period course duration/);
});

test("scheduler generates a validated timetable from the supplied Thai workbook", async () => {
  const records = await loadThaiWorkbookRecords();
  const result = generateTimetable({ records, options: { maxPlacementAttempts: 8 } });

  assert.equal(result.status, "feasible", `${result.errors.join("\n")}\n${JSON.stringify({ dailyPlan: result.dailyPlan, groupValidationFailures: result.groupValidationFailures, firstGroupValidationErrors: result.firstGroupValidationErrors })}`);
  assert.equal(result.errors.length, 0);
  assert.ok(result.schedule.length >= 50);
  assert.ok(result.teacherLoads["คุณครู A"] >= 24);
  assert.ok(result.teacherLoads["คุณครู A"] <= 28);
});
