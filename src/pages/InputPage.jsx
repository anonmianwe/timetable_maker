import { useState } from "react";
import { getFieldsForSource, getSourceTypes, suggestColumnMappings, suggestHeaderRow } from "../lib/mapping.js";
import { Icon, InfoCard, MessageList, PageHeading, StatusBadge } from "../components/ui.jsx";
import { th } from "../i18n/th.js";

const SOURCE_TYPE_TH = {
  courses: "รายวิชา",
  teachers: "ครู",
  rooms: "ห้องเรียน",
  availability: "เวลาว่าง",
  constraints: "ข้อกำหนด",
  document: "เอกสารอ้างอิง (ไม่นำเข้า)",
};

function sheetColumns(sheet, headerRow) {
  const headers = sheet?.rows.find((row) => row.number === headerRow)?.cells ?? [];
  const count = sheet?.rows.reduce((max, row) => Math.max(max, row.cells.length), headers.length) ?? headers.length;
  return Array.from({ length: count }, (_, index) => headers[index] ?? "");
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function InputPage({
  extraction, settings, setSettings, workbookImport, isReading, onFile,
  savedImports, onSave, onOpenSaved, onDeleteSaved,
  onNext,
}) {
  const [activeSheetName, setActiveSheetName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const sheets = extraction?.kind === "workbook" ? extraction.sheets : [];
  const activeSheet = sheets.find((sheet) => sheet.name === activeSheetName) ?? sheets[0];
  const activeConfig = activeSheet ? settings[activeSheet.name] : null;
  const columns = activeSheet && activeConfig ? sheetColumns(activeSheet, activeConfig.headerRow) : [];
  const fields = activeConfig ? getFieldsForSource(activeConfig.sourceType) : [];
  const sampleRows = activeSheet && activeConfig
    ? activeSheet.rows.filter((row) => row.number > activeConfig.headerRow).slice(0, 3)
    : [];
  const errors = workbookImport?.errors ?? [];
  const recordCount = workbookImport?.records.length ?? 0;
  const ready = extraction?.kind === "workbook" && recordCount > 0 && errors.length === 0;

  function updateSheet(name, patch) {
    setSettings((current) => ({ ...current, [name]: { ...current[name], ...patch } }));
  }

  function changeSourceType(sourceType) {
    const headerRow = suggestHeaderRow(activeSheet.rows, sourceType);
    updateSheet(activeSheet.name, {
      sourceType,
      included: sourceType !== "document",
      headerRow,
      mappings: suggestColumnMappings(sheetColumns(activeSheet, headerRow), sourceType),
    });
  }

  function changeHeaderRow(value) {
    const headerRow = Number(value);
    updateSheet(activeSheet.name, {
      headerRow,
      mappings: suggestColumnMappings(sheetColumns(activeSheet, headerRow), activeConfig.sourceType),
    });
  }

  function changeMapping(columnIndex, fieldKey) {
    const mappings = [...activeConfig.mappings];
    if (fieldKey) mappings.forEach((value, index) => { if (index !== columnIndex && value === fieldKey) mappings[index] = ""; });
    mappings[columnIndex] = fieldKey;
    updateSheet(activeSheet.name, { mappings });
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    onFile(event.dataTransfer.files?.[0]);
  }

  const status = isReading
    ? <StatusBadge tone="info">กำลังอ่านไฟล์</StatusBadge>
    : !extraction ? <StatusBadge tone="mute">รอการนำเข้า</StatusBadge>
      : ready ? <StatusBadge tone="ok">พร้อมจัดตาราง</StatusBadge>
        : <StatusBadge tone="warn">ต้องตรวจสอบ</StatusBadge>;

  return (
    <div className="sl-enter">
      <PageHeading eyebrow="01 / INPUT DATA" title={th.pages.input.title} description="นำเข้าไฟล์ข้อมูลรายวิชา ครู ห้องเรียน เวลา และโจทย์จากกรรมการ" status={status} />

      <section className="sl-card sl-card--raised upload-card" aria-labelledby="upload-title">
        <div className="sl-card__head">
          <div><h3 className="sl-card__title" id="upload-title">อัปโหลดข้อมูลต้นทาง</h3><p className="small">รองรับ Excel (.xlsx) และ PDF ที่มีข้อความ ระบบจะเก็บต้นฉบับไว้ในเครื่องเพื่ออ้างอิง</p></div>
          <span className="sl-badge sl-badge--mute">ขั้นตอน 1 / 3</span>
        </div>
        <label
          className={`sl-dropzone ${isDragging ? "is-dragging" : ""}`}
          htmlFor="source-file"
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span className="upload-icon">{isReading ? <span className="sl-spin" /> : "↑"}</span>
          <strong className="body-strong">{extraction?.fileName || th.pages.input.dropzone}</strong>
          <span className="caption">{extraction ? `${extraction.kind === "pdf" ? "PDF" : "XLSX"} · ${formatBytes(extraction.fileSize)}` : ".xlsx, .pdf · ขนาดไม่เกิน 25 MB (.xls ให้บันทึกเป็น .xlsx ก่อน)"}</span>
          <span className="sl-btn sl-btn--pri">{extraction ? "เลือกไฟล์ใหม่" : th.pages.input.btnSelect}</span>
          <input id="source-file" type="file" accept=".xlsx,.pdf" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </section>

      {extraction?.kind === "pdf" && (
        <section className="sl-card sl-card--raised" aria-labelledby="pdf-title">
          <div className="sl-card__head">
            <div><h3 className="sl-card__title" id="pdf-title">เอกสาร PDF · {extraction.pages.length} หน้า</h3><p className="small">PDF ใช้เป็นเอกสารอ้างอิงเท่านั้น ยังไม่นำเข้าเป็นข้อมูลจัดตาราง</p></div>
            {extraction.likelyScanned ? <StatusBadge tone="warn">อาจเป็นไฟล์สแกน (ยังไม่รองรับ OCR)</StatusBadge> : <StatusBadge tone="ok">อ่านข้อความได้</StatusBadge>}
          </div>
          <div className="pdf-pages">
            {extraction.pages.slice(0, 5).map((page) => (
              <article className="pdf-page" key={page.number}><span className="caption">หน้า {page.number} · {page.text.length} ตัวอักษร</span><p className="small">{page.text.slice(0, 500) || "ไม่มีข้อความที่เลือกได้"}</p></article>
            ))}
          </div>
          <div className="process-actions"><button className="sl-btn" type="button" onClick={() => onSave("Draft")}>บันทึกเอกสารไว้ในเครื่อง</button></div>
        </section>
      )}

      {extraction?.kind === "workbook" && (
        <section className="sl-card sl-card--raised" aria-labelledby="mapping-title">
          <div className="sl-card__head">
            <div><h3 className="sl-card__title" id="mapping-title">ตรวจสอบการจับคู่ข้อมูล</h3><p className="small">{recordCount} รายการจาก {workbookImport.sheets.filter((sheet) => sheet.included).length} ชีต · ข้ามหัวข้อ/หัวตารางซ้ำ {workbookImport.skipped} แถว</p></div>
            <span className="sl-badge sl-badge--mute">ขั้นตอน 2 / 3</span>
          </div>

          <div className="sheet-tabs" role="tablist">
            {sheets.map((sheet) => {
              const config = settings[sheet.name];
              const summary = workbookImport.sheets.find((item) => item.sheetName === sheet.name);
              return (
                <button key={sheet.name} type="button" role="tab" aria-selected={sheet.name === activeSheet?.name} className={`sheet-tab ${sheet.name === activeSheet?.name ? "is-active" : ""} ${summary?.errors.length ? "has-error" : ""}`} onClick={() => setActiveSheetName(sheet.name)}>
                  <strong>{sheet.name}</strong>
                  <small>{config?.included ? `${SOURCE_TYPE_TH[config.sourceType]} · ${summary?.records.length ?? 0} รายการ` : "ไม่นำเข้า"}</small>
                </button>
              );
            })}
          </div>

          {activeSheet && activeConfig && (
            <>
              <div className="mapping-toolbar">
                <label className="sl-toggle"><input type="checkbox" checked={Boolean(activeConfig.included)} disabled={activeConfig.sourceType === "document"} onChange={(event) => updateSheet(activeSheet.name, { included: event.target.checked })} /><span className="sl-toggle__track" />นำเข้าชีตนี้</label>
                <label className="sl-field"><span className="sl-label">ประเภทข้อมูล</span>
                  <select className="sl-select" value={activeConfig.sourceType} onChange={(event) => changeSourceType(event.target.value)}>
                    {getSourceTypes().map((type) => <option key={type.key} value={type.key}>{SOURCE_TYPE_TH[type.key] ?? type.label}</option>)}
                  </select>
                </label>
                <label className="sl-field"><span className="sl-label">แถวหัวตาราง</span>
                  <input className="sl-input" type="number" min="1" value={activeConfig.headerRow} onChange={(event) => changeHeaderRow(event.target.value)} />
                </label>
              </div>

              {activeConfig.sourceType !== "document" && (
                <div className="sl-tablewrap">
                  <table className="sl-table">
                    <thead><tr><th scope="col">คอลัมน์ในไฟล์</th><th scope="col">จับคู่กับฟิลด์</th><th scope="col">ตัวอย่างค่า</th></tr></thead>
                    <tbody>
                      {columns.map((header, index) => (
                        <tr key={index} className={activeConfig.mappings[index] ? "" : "is-unmapped"}>
                          <th scope="row">{header || <span className="caption">คอลัมน์ {index + 1} (ไม่มีหัว)</span>}</th>
                          <td>
                            <select className="sl-select sl-select--sm" value={activeConfig.mappings[index] ?? ""} onChange={(event) => changeMapping(index, event.target.value)}>
                              <option value="">— ไม่ใช้ (เก็บเป็นข้อมูลต้นฉบับ) —</option>
                              {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                            </select>
                          </td>
                          <td className="small">{sampleRows.map((row) => row.cells[index]).filter(Boolean).slice(0, 2).join(" · ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <MessageList items={errors} />
          <div className="process-actions">
            <button className="sl-btn" type="button" onClick={() => onSave("Draft")}>บันทึกฉบับร่าง</button>
            <button className="sl-btn sl-btn--pri" type="button" disabled={!ready} onClick={() => { onSave("Confirmed"); onNext(); }}>ยืนยันข้อมูลและไปประมวลผล <Icon>→</Icon></button>
            {!ready && <span className="sl-hint">{errors.length ? "แก้ไขรายการที่ผิดพลาดก่อนยืนยัน" : "ยังไม่มีรายการที่จับคู่ได้"}</span>}
          </div>
        </section>
      )}

      <div className="content-grid">
        <InfoCard title="ข้อมูลที่บันทึกในเครื่อง" eyebrow="SAVED IMPORTS">
          {savedImports.length === 0 ? <p>ยังไม่มีข้อมูลที่บันทึก</p> : (
            <ul className="saved-list">
              {savedImports.map((record) => (
                <li key={record.id}>
                  <button className="saved-open" type="button" onClick={() => onOpenSaved(record)}>
                    <strong>{record.fileName}</strong>
                    <small>{record.status === "Confirmed" ? "ยืนยันแล้ว" : "ฉบับร่าง"} · {new Date(record.updatedAt).toLocaleString("th-TH")}</small>
                  </button>
                  <button className="sl-btn sl-btn--sm sl-btn--ghost" type="button" aria-label={`ลบ ${record.fileName}`} onClick={() => onDeleteSaved(record.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      </div>
    </div>
  );
}
