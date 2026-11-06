const COMMON_FIELDS = [
  { key: "courseCode", label: "Course code", aliases: ["course code", "code", "รหัสวิชา"] },
  { key: "courseName", label: "Course name", aliases: ["course name", "course", "subject", "รายวิชา"] },
  { key: "hours", label: "Hours / periods", aliases: ["hours", "periods", "ชั่วโมง", "คาบ"] },
  { key: "courseType", label: "Theory / practical", aliases: ["course type", "type", "ประเภทวิชา"] },
  { key: "requirements", label: "Requirements", aliases: ["requirements", "requirement", "ข้อกำหนด"] },
  { key: "roomRequirement", label: "Room requirement", aliases: ["teaching room", "room", "room requirement", "ห้องที่ใช้สอน"] },
  { key: "category", label: "Course category", aliases: ["category", "หมวดวิชา"] },
  { key: "academicYear", label: "Academic year", aliases: ["academic year", "year", "ระดับชั้น"] },
  { key: "teacherName", label: "Teacher name", aliases: ["teacher", "teachers", "teacher name", "instructor", "รายชื่อครู"] },
  { key: "position", label: "Position", aliases: ["position", "role", "ตำแหน่ง"] },
  { key: "availability", label: "Availability / unavailability", aliases: ["availability", "unavailable", "additional requirements", "ข้อกำหนดเพิ่มเติม"] },
  { key: "roomName", label: "Room name", aliases: ["room name", "ห้องเรียน"] },
  { key: "roomType", label: "Room type", aliases: ["room type", "ประเภทห้อง"] },
  { key: "capacity", label: "Capacity", aliases: ["capacity", "size", "ขนาด"] },
];

const SOURCE_TYPES = [
  { key: "courses", label: "Courses" },
  { key: "teachers", label: "Teachers" },
  { key: "rooms", label: "Rooms" },
  { key: "availability", label: "Availability" },
  { key: "constraints", label: "Scheduling constraints" },
  { key: "document", label: "Reference document" },
];

const HEADER_FIELDS = {
  courses: ["courseCode", "courseName", "hours", "courseType", "requirements", "roomRequirement", "category", "academicYear"],
  teachers: ["teacherName", "position", "availability", "hours"],
  rooms: ["roomName", "roomType", "capacity", "availability"],
  availability: ["teacherName", "roomName", "academicYear", "availability"],
  constraints: ["academicYear", "courseName", "requirements"],
  document: [],
};

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/[\s_\-./:()]+/g, "");
}

export function getSourceTypes() {
  return SOURCE_TYPES;
}

export function getFieldsForSource(sourceType) {
  const keys = new Set(HEADER_FIELDS[sourceType] ?? []);
  return COMMON_FIELDS.filter((field) => keys.has(field.key));
}

export function guessSourceType(name = "") {
  const value = name.toLocaleLowerCase();
  if (/teacher|ครู/.test(value)) return "teachers";
  if (/room|ห้อง/.test(value)) return "rooms";
  if (/constraint|requirement|ข้อกำหนด/.test(value)) return "constraints";
  if (/course|subject|vocational|certificate|year\s*[1-3]|รายวิชา|ปวช/.test(value)) return "courses";
  return "document";
}

export function suggestHeaderRow(rows, sourceType) {
  const fields = getFieldsForSource(sourceType);
  let best = { rowNumber: rows.find((row) => row.cells.some((cell) => String(cell).trim()))?.number ?? 1, score: 0 };

  for (const row of rows.slice(0, 30)) {
    const values = row.cells.map(normalize);
    const score = fields.reduce((total, field) => {
      const aliases = [field.label, ...field.aliases].map(normalize);
      return total + (values.some((value) => aliases.includes(value)) ? 1 : 0);
    }, 0);
    if (score > best.score) best = { rowNumber: row.number, score };
  }
  return best.rowNumber;
}

export function suggestColumnMappings(headers, sourceType) {
  const fields = getFieldsForSource(sourceType);
  const used = new Set();
  return headers.map((header) => {
    const normalized = normalize(header);
    const match = fields.find((field) => {
      if (used.has(field.key)) return false;
      return [field.label, ...field.aliases].some((alias) => normalize(alias) === normalized);
    });
    if (!match) return "";
    used.add(match.key);
    return match.key;
  });
}

export function getFieldLabel(fieldKey) {
  return COMMON_FIELDS.find((field) => field.key === fieldKey)?.label ?? fieldKey;
}
