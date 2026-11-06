import { useMemo, useState } from "react";
import { MessageList, PageHeading, StatusBadge } from "../components/ui.jsx";
import { RESULT_STATUS } from "./ProcessingPage.jsx";

const DAYS_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const PERIODS = Array.from({ length: 11 }, (_, index) => index + 1);
const VIEWS = [
  { id: "group", label: "กลุ่มเรียน" },
  { id: "teacher", label: "ครูผู้สอน" },
  { id: "room", label: "ห้องเรียน" },
  { id: "course", label: "รายวิชา" },
];

function keysFor(view, schedule) {
  const values = new Set();
  for (const lesson of schedule) {
    if (view === "group") lesson.groupIds.forEach((group) => values.add(group));
    if (view === "teacher") values.add(lesson.teacherName);
    if (view === "room") values.add(lesson.roomName);
  }
  return [...values].sort((left, right) => left.localeCompare(right, "th"));
}

function matches(view, key, lesson) {
  if (view === "group") return lesson.groupIds.includes(key);
  if (view === "teacher") return lesson.teacherName === key;
  return lesson.roomName === key;
}

function LessonCell({ lesson, view }) {
  return (
    <div className={`sl-cell ${lesson.courseType === "practical" ? "sl-cell--practice" : "sl-cell--theory"}`} title={`${lesson.courseCode} ${lesson.courseName}`}>
      <span className="sl-cell__code">{lesson.courseCode}</span>
      <small>{lesson.courseName}</small>
      {view !== "teacher" && <small>{lesson.teacherName}</small>}
      {view !== "room" && <small className="sl-cell__tnn">{lesson.roomName}</small>}
      {view !== "group" && <small>{lesson.groupIds.join(", ")}</small>}
    </div>
  );
}

function WeekGrid({ lessons, view }) {
  return (
    <div className="sl-tablewrap">
      <table className="sl-tt sl-tt--rows">
        <thead><tr><th scope="col">วัน / คาบ</th>{PERIODS.map((period) => <th scope="col" key={period}>{period}</th>)}</tr></thead>
        <tbody>
          {DAYS_TH.map((dayName, dayIndex) => {
            const dayLessons = lessons.filter((lesson) => lesson.dayIndex === dayIndex);
            const lastPeriod = Math.max(0, ...dayLessons.map((lesson) => lesson.endPeriod));
            const cells = [];
            for (let period = 1; period <= PERIODS.length;) {
              const lesson = dayLessons.find((item) => item.startPeriod === period);
              if (lesson) {
                cells.push(<td key={period} colSpan={lesson.duration}><LessonCell lesson={lesson} view={view} /></td>);
                period += lesson.duration;
                continue;
              }
              const isBreak = view === "group" && period >= 4 && period <= 6 && period < lastPeriod;
              cells.push(<td key={period}><div className={`sl-cell ${isBreak ? "sl-cell--break" : "sl-cell--free"}`}>{isBreak ? "พัก" : ""}</div></td>);
              period += 1;
            }
            return <tr key={dayName}><th scope="row">{dayName}</th>{cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function CourseTable({ schedule }) {
  const rows = [...schedule].sort((left, right) => left.courseCode.localeCompare(right.courseCode) || left.groupIds.join().localeCompare(right.groupIds.join()));
  return (
    <div className="sl-tablewrap">
      <table className="sl-table">
        <thead><tr><th scope="col">รหัสวิชา</th><th scope="col">ชื่อวิชา</th><th scope="col">กลุ่ม</th><th scope="col">วัน</th><th scope="col" className="num">คาบ</th><th scope="col">ครู</th><th scope="col">ห้อง</th></tr></thead>
        <tbody>
          {rows.map((lesson) => (
            <tr key={lesson.eventId}><th scope="row" className="mono">{lesson.courseCode}</th><td>{lesson.courseName}</td><td>{lesson.groupIds.join(", ")}</td><td>{DAYS_TH[lesson.dayIndex]}</td><td className="num">{lesson.startPeriod}–{lesson.endPeriod}</td><td>{lesson.teacherName}</td><td>{lesson.roomName}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OutputPage({ result, onGoProcessing }) {
  const [view, setView] = useState("group");
  const [selected, setSelected] = useState({});
  const schedule = result?.status === "feasible" ? result.schedule ?? [] : [];
  const keys = useMemo(() => (view === "course" ? [] : keysFor(view, schedule)), [view, schedule]);
  const activeKey = keys.includes(selected[view]) ? selected[view] : keys[0];
  const lessons = view === "course" ? schedule : schedule.filter((lesson) => matches(view, activeKey, lesson));
  const meta = result ? RESULT_STATUS[result.status] ?? RESULT_STATUS.error : null;

  return (
    <div className="sl-enter">
      <PageHeading eyebrow="03 / OUTPUT DATA" title="ผลลัพธ์การจัดตาราง" description="ตารางเรียนตามกลุ่มเรียน ครู ห้อง และรายวิชา จากผลที่ผ่านการตรวจเท่านั้น" status={meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : <StatusBadge tone="mute">ยังไม่ได้ประมวลผล</StatusBadge>} />

      <section className="sl-card sl-card--raised output-summary">
        <div>
          <p className="eyebrow">SCHEDULE OUTPUT</p>
          <h2>{schedule.length ? `${schedule.length} บล็อกเรียนที่ผ่านการตรวจ` : "ยังไม่มีผลลัพธ์ที่ยืนยันแล้ว"}</h2>
          <p className="small">{schedule.length ? "ตารางนี้ผ่านตัวตรวจเงื่อนไข hard ทุกข้อแล้ว" : "ระบบจะไม่แสดงตารางจนกว่าผลจะผ่านการตรวจ"}</p>
        </div>
        <div className="output-actions">
          <button className="sl-btn" type="button" disabled title="ยังไม่ได้พัฒนา">ส่งออก Excel</button>
          <button className="sl-btn" type="button" disabled title="ยังไม่ได้พัฒนา">ส่งออก PDF</button>
        </div>
      </section>

      {!schedule.length && (
        <section className="sl-card">
          {result ? <MessageList items={result.errors} /> : <p className="small">ไปที่หน้าประมวลผลเพื่อสร้างตาราง</p>}
          <div className="process-actions"><button className="sl-btn" type="button" onClick={onGoProcessing}>ไปหน้าประมวลผล</button></div>
        </section>
      )}

      {schedule.length > 0 && (
        <>
          <dl className="sl-meta">
            <div><dt>บล็อกเรียน</dt><dd>{schedule.length}</dd></div>
            <div><dt>กลุ่มเรียน</dt><dd>{keysFor("group", schedule).length}</dd></div>
            <div><dt>ครู</dt><dd>{keysFor("teacher", schedule).length}</dd></div>
            <div><dt>ห้อง</dt><dd>{keysFor("room", schedule).length}</dd></div>
            <div><dt>รอบที่ใช้</dt><dd>{result.attempts}</dd></div>
          </dl>

          <section className="sl-card sl-card--raised">
            <div className="view-toolbar">
              <div className="segmented" role="tablist">
                {VIEWS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}
              </div>
              {view !== "course" && (
                <select className="sl-select" value={activeKey ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [view]: event.target.value }))}>
                  {keys.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              )}
            </div>
            {view === "course" ? <CourseTable schedule={schedule} /> : <WeekGrid lessons={lessons} view={view} />}
          </section>

          {result.teacherLoads && (
            <section className="sl-card sl-card--flat">
              <h3 className="sl-card__title">ภาระงานสอน (ไม่นับวิชาสามัญ)</h3>
              <div className="rule-tags">{Object.entries(result.teacherLoads).map(([name, load]) => <span key={name}>{name}: {load} คาบ</span>)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
