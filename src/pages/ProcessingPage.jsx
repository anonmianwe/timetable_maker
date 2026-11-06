import { Icon, MessageList, PageHeading, StatusBadge } from "../components/ui.jsx";

export const RESULT_STATUS = {
  feasible: { tone: "ok", label: "จัดตารางสำเร็จ ผ่านการตรวจ" },
  invalid_input: { tone: "bad", label: "ข้อมูลนำเข้าไม่ครบ/ไม่ถูกต้อง" },
  infeasible: { tone: "bad", label: "ไม่มีตารางที่ตรงตามเงื่อนไข" },
  resource_assignment_failed: { tone: "bad", label: "จัดครู/ห้องไม่ได้" },
  search_limit: { tone: "warn", label: "ค้นหาครบจำนวนรอบแล้วยังไม่พบ (ยังไม่ใช่ข้อพิสูจน์ว่าจัดไม่ได้)" },
  validation_failed: { tone: "bad", label: "ตารางไม่ผ่านการตรวจ" },
  error: { tone: "bad", label: "ระบบผิดพลาด" },
  cancelled: { tone: "mute", label: "ยกเลิกแล้ว" },
};

function stepStates({ confirmed, hasData, running, result }) {
  const status = result?.status;
  const solverFailed = ["infeasible", "resource_assignment_failed", "search_limit", "error"].includes(status);
  return [
    { title: "อ่านและแยกโครงสร้างไฟล์", state: hasData ? "ok" : "mute" },
    { title: "ยืนยันการจับคู่ฟิลด์", state: confirmed ? "ok" : hasData ? "warn" : "mute" },
    { title: "สร้างบล็อกเรียนแบบต่อเนื่อง", state: running ? "info" : status === "invalid_input" ? "bad" : result && status !== "cancelled" ? "ok" : "mute" },
    { title: "ค้นหาตารางและจับคู่ครู/ห้องด้วย MRV", state: running ? "info" : solverFailed ? (status === "search_limit" ? "warn" : "bad") : ["feasible", "validation_failed"].includes(status) ? "ok" : "mute" },
    { title: "ตรวจครู ห้อง และกลุ่มเรียนซ้ำซ้อน (ตัวตรวจแยก)", state: status === "feasible" ? "ok" : status === "validation_failed" ? "bad" : "mute" },
    { title: "สรุปผลและเหตุผลกรณีจัดไม่ได้", state: result && status !== "cancelled" ? (status === "feasible" ? "ok" : "warn") : "mute" },
  ];
}

const STATE_LABEL = { ok: "เสร็จ", info: "กำลังทำ", warn: "ต้องตรวจ", bad: "ไม่ผ่าน", mute: "รอ" };

export default function ProcessingPage({ source, confirmed, hasData, running, elapsedMs, result, options, onOptionsChange, onRun, onCancel, onBack, onShowOutput }) {
  const steps = stepStates({ confirmed, hasData, running, result });
  const meta = result ? RESULT_STATUS[result.status] ?? RESULT_STATUS.error : null;

  return (
    <div className="sl-enter">
      <PageHeading
        eyebrow="02 / PROCESSING STEPS"
        title="ประมวลผลและตรวจสอบ"
        description="สร้างตารางตามข้อกำหนดจากข้อมูลที่ยืนยันแล้ว และตรวจความขัดแย้งด้วยตัวตรวจที่แยกจากตัวจัดตาราง"
        status={running ? <StatusBadge tone="info">กำลังประมวลผล</StatusBadge> : meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : <StatusBadge tone="mute">ยังไม่เริ่ม</StatusBadge>}
      />

      <section className="sl-card sl-card--raised" aria-labelledby="process-title">
        <div className="sl-card__head">
          <div><h3 className="sl-card__title" id="process-title">ลำดับการประมวลผล</h3><p className="small">{source ? `แหล่งข้อมูล: ${source}` : "กรุณากลับไปนำเข้าข้อมูลก่อนเริ่มประมวลผล"}</p></div>
          {running && <span className="sl-badge sl-badge--info"><span className="sl-spin" /> {Math.round(elapsedMs / 1000)} วินาที</span>}
        </div>

        <ol className="process-list">
          {steps.map((step, index) => (
            <li className={step.state === "info" ? "is-active" : ""} key={step.title}>
              <span>{step.state === "ok" ? "✓" : index + 1}</span>
              <div><strong>{step.title}</strong></div>
              <StatusBadge tone={step.state}>{STATE_LABEL[step.state]}</StatusBadge>
            </li>
          ))}
        </ol>

        <div className="run-options">
          <label className="sl-toggle"><input type="checkbox" checked={options.enforceTeacherWorkload} disabled={running} onChange={(event) => onOptionsChange({ enforceTeacherWorkload: event.target.checked })} /><span className="sl-toggle__track" />บังคับภาระงานสอนขั้นต่ำ/สูงสุดของครู</label>
          <label className="sl-field run-attempts"><span className="sl-label">จำนวนรอบทางเลือกสูงสุด</span><input className="sl-input" type="number" min="1" max="50" value={options.maxPlacementAttempts} disabled={running} onChange={(event) => onOptionsChange({ maxPlacementAttempts: Math.max(1, Number(event.target.value) || 1) })} /></label>
        </div>

        <div className="process-actions">
          {running
            ? <button className="sl-btn sl-btn--danger" type="button" onClick={onCancel}>ยกเลิก</button>
            : <button className="sl-btn sl-btn--pri" type="button" onClick={onRun} disabled={!confirmed}>{result ? "ประมวลผลใหม่" : "เริ่มประมวลผล"}</button>}
          {!confirmed && <><span className="sl-hint">ต้องยืนยันข้อมูลจากหน้านำเข้าข้อมูลก่อน</span><button className="sl-btn sl-btn--ghost sl-btn--sm" type="button" onClick={onBack}>กลับไปนำเข้าข้อมูล</button></>}
          {result?.status === "feasible" && <button className="sl-btn" type="button" onClick={onShowOutput}>ดูผลลัพธ์ <Icon>→</Icon></button>}
        </div>
      </section>

      {result && result.status !== "cancelled" && (
        <section className="sl-card sl-card--flat" aria-labelledby="result-title">
          <div className="sl-card__head">
            <h3 className="sl-card__title" id="result-title">ผลการประมวลผล</h3>
            <span className="caption mono">{result.attempts ? `${result.attempts} รอบ · ` : ""}{Math.round(elapsedMs / 100) / 10} วินาที</span>
          </div>
          {result.algorithm && <p className="small">{result.algorithm}</p>}
          <MessageList items={result.errors} />
          {result.assumptions?.length > 0 && (
            <details className="assumptions"><summary className="body-strong">สมมติฐานที่ใช้ ({result.assumptions.length})</summary><MessageList tone="info" items={result.assumptions} /></details>
          )}
        </section>
      )}

      <section className="sl-card sl-card--flat" aria-labelledby="rules-title">
        <div className="sl-card__head"><h3 className="sl-card__title" id="rules-title">เงื่อนไขที่ตรวจ</h3></div>
        <div className="rule-tags"><span>ปวช.1 ≤ คาบ 9</span><span>ระดับอื่น ≤ คาบ 11</span><span>เริ่มคาบ 1 ทุกวัน</span><span>พักคาบ 4–6</span><span>ไม่มีคาบว่างนอกจากพัก</span><span>ครู/ห้อง/กลุ่มห้ามชน</span><span>เรียนต่อเนื่องครบคาบ</span><span>วิชาที่กำหนดวัน/คาบ</span><span>COM1–4 / LAB1–2</span><span>ภาระงานสอนครู</span></div>
      </section>
    </div>
  );
}
