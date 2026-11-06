# Timetable Scheduling Constraints and Data Notes

Purpose: Give an AI scheduler a source-grounded description of the timetable rules, evaluation criteria, workbook data, and unresolved inputs.

## Sources

- `base/guideline.pdf`: operating rules and expected system inputs/outputs.
- `base/criteria.pdf`: 100-point competition evaluation rubric.
- `base/data.xlsx`: Thai course and teacher data.
- `base/data_en.xlsx`: English translation of the same data; do not import it as duplicate records.

## Scheduling model

Represent each lesson assignment with academic year, student group(s), course, duration, teacher, room, weekday, starting period, and occupied consecutive periods. The system should import courses, teacher and room availability, room capacity/type, time periods, and committee constraints. It should produce views by group, teacher, room, and course; explain conflicts and infeasibility; and export Excel/PDF.

## Adaptable file ingestion requirements

- Accept Excel workbooks and PDF documents whose layouts, column names, languages, and number of fields may differ from the supplied examples. Do not require uploads to match one fixed extraction JSON shape.
- Use a configurable external AI extraction service to inspect the uploaded source and propose a source-appropriate schema, field mapping, and structured extraction. The JSON shape in this document is a suggested default/template, not a mandatory AI output contract.
- Handle reordered or additional Excel columns by mapping headers rather than fixed column positions. Preserve unmapped fields as source data and do not silently interpret them as scheduling rules.
- For PDFs, extract text and tables where possible; use OCR for scanned pages. Mark uncertain or ambiguous fields for review rather than treating guesses as confirmed constraints.
- Show the proposed schema, extracted records, source location/evidence, and uncertain mappings in an import preview. Require user confirmation or correction before importing records into the scheduler.
- Validate the confirmed data and normalize it into the system's stable scheduling entities (courses, groups, teachers, rooms, availability, and constraints). The scheduling engine must consume these normalized entities, not arbitrary AI-generated JSON directly.
- Retain the original upload and record the extraction/schema version and user-approved field mappings so imports can be audited or corrected later.

## Hard student constraints

1. Schedule Monday through Friday.
2. Every year/group starts in period 1 and has lessons every weekday.
3. ปวช.1 finishes no later than period 9 (17:30); other levels no later than period 11 (19:30).
4. Each year has one break period, selected from 4, 5, or 6. Students have no idle periods between lessons except this break.
5. A student group cannot have overlapping lessons.
6. Schedule every required course period. Each course meeting must be consecutive; do not split a required block. Whether a course can have multiple blocks on separate days is unspecified.
7. Theory courses are taught to both groups together; practical courses are taught separately to groups 1 and 2.
8. Activity and scout courses must be Thursday periods 6–7. These are absent from the supplied workbook.
9. Honor course-specific weekday/period requirements.

## Hard teacher constraints

- A teacher cannot have overlapping lessons or be assigned during unavailable periods.
- Department heads and section heads: 24–28 teaching hours. Department instructors: 30–38.
- General education courses do not count toward department teachers' teaching-hour totals.
- Respect any teacher-specific maximum workload.

## Hard room constraints

- A room cannot host overlapping lessons; respect room availability.
- Computer-room courses use COM1–COM4; laboratory courses use LAB1–LAB2.
- Match room type to course need. General education uses external classrooms, which may be reused at different times.
- Respect room capacity when known.

## Evaluation rubric checklist

The rubric allocates 40 points to rule compliance, 15 to timetable completeness/quality, 35 to system capability, 20 to AI application, and 10 to presentation. It explicitly checks finish-period limits, lunch, activity/scout placement, combined/separated groups, teacher loads, room types and conflicts, consecutive lessons, teacher/group conflicts, availability, period-1 starts, no gaps except lunch, course-specific constraints, complete courses/periods and group/teacher/room schedules, automatic generation, conflict explanations, Excel/PDF export, and a suitable AI/optimization method with explanation and evidence of quality improvement.

The rubric says contradictory constraints that make a schedule impossible should be accompanied by analysis and a report explaining the cause. Do not silently omit requirements; report infeasibility and its causes.

## Workbook observations and mapping

Both workbooks contain three vocational-year sheets and one teacher sheet. The Thai and English files are translations of the same records.

Course fields: code, name, hours, theory/practical type, requirements, teaching-room description, year (sheet), and category (section heading: general education or department course). Preserve the original course code and create a normalized comparison key. Keep hours numeric, but do not assume hours equal periods until confirmed. Preserve raw requirement and room text; parse only when unambiguous.

Teacher fields: name, position, and additional requirements. Section headings and repeated column headers are not records. Some course requirement and room cells are blank. Only Teacher A has an explicit availability note (free Wednesday periods 1–4). Workbook room descriptions must be mapped to the named inventory COM1–COM4 and LAB1–LAB2.

## Gaps and questions to resolve

1. Does one workbook hour equal one timetable period? Is the value a weekly total or one meeting duration?
2. Can a course have multiple contiguous blocks on separate days? Until clarified, keep each meeting block contiguous and preserve total duration.
3. Is the break shared by all groups in a year, and is it the same period each weekday?
4. Are workload limits measured in clock hours or periods? How is a combined theory lesson counted? General education is explicitly excluded for department teachers.
5. Provide activity/scout course records and actual teacher records/availability; current teacher names are placeholders and availability is sparse.
6. Provide room capacities, availability, and mappings for room descriptions, especially “computer room or laboratory.”
7. The supplied data covers ปวช.1–3 only, although rules cover other levels too.
8. Does “students have lessons every day” apply to each group individually or to the year collectively?
9. Provide the external classroom inventory if room-level timetables must include those rooms.

Preserve source values and list assumptions in generated schedule metadata until these questions are resolved.

## Default Suggested JSON Shape

This example is a starting point for the AI import proposal and for user-created data. An upload may need a different source-specific extraction shape; after user review, map its confirmed values into the stable scheduling entities described above.

```json
{
  "source_language": "th",
  "academic_year": "ปวช.1",
  "groups": ["ทค.1/1", "ทค.1/2"],
  "courses": [{
    "code": "20000 - 1101",
    "code_key": "20000-1101",
    "name": "ภาษาไทยเพื่อการสื่อสาร",
    "hours": 2,
    "type": "theory",
    "category": "general_education",
    "requirements_raw": "จัดอยู่ในวันจันทร์คาบที่ 1-2",
    "room_requirement_raw": "ห้องเรียนภาษาไทย"
  }],
  "teachers": [{
    "name": "คุณครู A",
    "position": "หัวหน้าแผนก",
    "requirements_raw": "ต้องว่างวันพุธคาบที่ 1-4"
  }],
  "rules": {
    "weekdays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "max_period": 9,
    "break_period_options": [4, 5, 6]
  },
  "assumptions": []
}
```

This is a planning schema, not converted workbook output. Link Thai and English names to the same course identity during import.
