import test from "node:test";
import assert from "node:assert/strict";
import { guessSourceType, suggestColumnMappings, suggestHeaderRow } from "./mapping.js";

test("source type can be suggested from Thai workbook sheet names", () => {
  assert.equal(guessSourceType("ครู"), "teachers");
  assert.equal(guessSourceType("ปวช.2"), "courses");
  assert.equal(guessSourceType("Vocational Certificate Year 2"), "courses");
});

test("header detection skips a workbook title row", () => {
  const rows = [
    { number: 1, cells: ["2 groups: TC.1/1-2"] },
    { number: 2, cells: ["Course Code", "Course Name", "Hours", "Course Type"] },
  ];
  assert.equal(suggestHeaderRow(rows, "courses"), 2);
});

test("known headers map by meaning and preserve unknown columns", () => {
  const mappings = suggestColumnMappings(["รหัสวิชา", "Course Name", "Extra Notes"], "courses");
  assert.deepEqual(mappings, ["courseCode", "courseName", ""]);
});
