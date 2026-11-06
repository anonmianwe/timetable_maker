# Frontend Handoff: Local Timetable Maker

## Goal

Build a local-first web app for importing vocational course and teacher data, reviewing it, generating timetables, checking conflicts, and viewing/exporting schedules. This is a working scheduling tool, not a marketing site.

## Agreed Direction

- Use React with plain JavaScript and Vite. Do not use TypeScript.
- Keep application logic in JavaScript. Do not introduce Python services or Python-written algorithms.
- Plan for one local Node.js + Express app to serve the frontend and API.
- Use a local SQLite database rather than a mock database. It should persist data across app restarts without requiring a separate database server.
- The AI runs on another laptop on the local network. The browser talks to the app server; the app server talks to the AI endpoint. Keep the AI address configurable.
- Keep the scheduling solver undecided until a JavaScript-compatible option is tested against the supplied timetable data.
- Keep automated tests small and fast. Node's built-in test runner is the initial preference.

## Main User Flow

1. User uploads an Excel workbook or PDF.
2. The app identifies the file type and inspects workbook sheets, headers, PDF pages, and extractable tables/text.
3. The app asks the local AI service to propose a source-specific schema, field mapping, and extracted records. The example schema in `scheduling_constraints.md` is a suggestion, not a fixed upload format.
4. The user reviews a preview showing extracted values, source sheet/page/cell when available, field mappings, and uncertain items.
5. The user can correct mappings and values, leave unrelated extra fields unused, then confirm the import.
6. The app validates confirmed data and reports missing, invalid, duplicate, or contradictory records. Do not silently drop records or convert guesses into hard constraints.
7. Approved data is normalized into consistent scheduler records and saved locally.
8. User generates a timetable, reviews any conflicts or infeasibility explanation, then views and exports the result.

## Import Experience

- Match spreadsheet fields by header, not fixed column position. Support reordered columns, extra columns, and Thai or English labels.
- Preserve unknown columns as source data. Do not apply an unknown column as a scheduling rule unless the user maps/confirms it.
- Support multi-sheet workbooks and let the user see which sheets will be imported.
- Extract text/tables from text-based PDFs. Scanned PDFs may need OCR; mark OCR results and uncertain fields for user confirmation.
- Keep the original file and show where imported values came from. Thai and English versions of the same workbook are alternative representations of the same records, not duplicate datasets.
- If the AI endpoint is unavailable, clearly show that extraction cannot continue yet; retain the upload/draft where possible and allow retry. Do not pretend extraction succeeded.

## Timetable Views and Actions

- Provide timetable views by student group, teacher, room, and course.
- Allow selecting an academic year and group; show course, teacher, room, weekday, and occupied periods.
- Show conflicts and unmet requirements with understandable reasons. If no valid schedule can be generated, report why rather than omitting courses or relaxing a hard rule silently.
- Provide Excel and PDF export when schedule generation is implemented.

## Scheduling Facts the UI Must Reflect

- The supplied workbook covers vocational certificate Years 1, 2, and 3, with two groups per year. Theory lessons are shared by both groups; practical lessons are separate for Groups 1 and 2.
- Monday through Friday are the scheduling days. Each group should start in period 1 and have lessons every weekday.
- Year 1 must finish by period 9. Years 2 and 3 must finish by period 11.
- Each group needs one break period chosen from 4, 5, or 6, with no gaps between lessons except the break. Year 3's fixed lessons may require different break periods on different weekdays; do not assume one break slot works every day without checking feasibility.
- Required course meetings stay consecutive and honor fixed day/period requirements. The workbook contains different fixed slots by year, including Thursday periods 6-7 activities in all three years.
- A teacher, room, or student group cannot have overlapping lessons. Teachers can be assigned to any course; Teacher A must be free Wednesday periods 1-4.
- Computer courses require one of COM1-COM4; lab courses require LAB1-LAB2. Courses that allow either room type may use either. General-education courses use external classrooms.
- Teacher workload limits depend on position. General-education courses do not count toward department teachers' teaching-hour totals.
- Preserve course codes and source values. Workbook hours are not yet confirmed to equal timetable periods; expose assumptions clearly until resolved.

## Important UI States

- Empty state before any data is imported.
- Upload progress, parsing/extraction progress, AI unavailable, and recoverable error states.
- Import preview with mapped, unmapped, and uncertain fields.
- Validation results with row/course/teacher references and clear correction paths.
- Schedule generation progress, success, warnings, and infeasible result with explanation.
- Empty schedule state when a year/group has no generated timetable.

## Boundaries and Open Decisions

- Frontend should not call the AI laptop directly; use the local app API.
- AI output is a proposal for review, not trusted scheduler input. The backend must validate and normalize confirmed data before scheduling.
- PDF/OCR library, Excel library, exact API contract, AI provider/protocol, and JavaScript scheduling solver are not locked yet.
- Full scheduling rules and source notes are in `docs/scheduling_constraints.md`; consult it before implementing schedule controls.
