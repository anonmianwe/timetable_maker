import { useEffect, useMemo, useRef, useState } from "react";
import { th } from "./i18n/th.js";
import { inspectFile } from "./lib/fileReader.js";
import { guessSourceType, suggestColumnMappings, suggestHeaderRow } from "./lib/mapping.js";
import { listImports, removeImport, saveImport } from "./lib/storage.js";
import { buildWorkbookImport } from "./lib/workbookImport.js";
import { Icon, Notice } from "./components/ui.jsx";
import InputPage from "./pages/InputPage.jsx";
import ProcessingPage from "./pages/ProcessingPage.jsx";
import OutputPage from "./pages/OutputPage.jsx";

const navigation = [
  { id: "input", label: th.nav.input, icon: "↑" },
  { id: "processing", label: th.nav.processing, icon: "◷" },
  { id: "output", label: th.nav.output, icon: "▤" },
];

function makeSettings(extraction) {
  if (extraction.kind === "pdf") return { pdf: { sourceType: "document", headerRow: 1, mappings: [], included: false } };
  return Object.fromEntries(extraction.sheets.map((sheet) => {
    const sourceType = guessSourceType(sheet.name);
    const headerRow = suggestHeaderRow(sheet.rows, sourceType);
    const header = sheet.rows.find((row) => row.number === headerRow)?.cells ?? [];
    const columnCount = sheet.rows.reduce((max, row) => Math.max(max, row.cells.length), header.length);
    const headerCells = Array.from({ length: columnCount }, (_, index) => header[index] ?? "");
    return [sheet.name, { sourceType, included: sourceType !== "document", headerRow, mappings: suggestColumnMappings(headerCells, sourceType) }];
  }));
}

function App() {
  const [active, setActive] = useState("input");
  const [theme, setTheme] = useState(() => localStorage.getItem("tm-theme") ?? "light");
  const [extraction, setExtraction] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [settings, setSettings] = useState({});
  const [confirmedSettings, setConfirmedSettings] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [savedImports, setSavedImports] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [options, setOptions] = useState({ enforceTeacherWorkload: true, maxPlacementAttempts: 8 });
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState(null);
  const workerRef = useRef(null);

  const workbookImport = useMemo(
    () => (extraction?.kind === "workbook" ? buildWorkbookImport(extraction, settings) : null),
    [extraction, settings],
  );
  const settingsKey = JSON.stringify(settings);
  const ready = Boolean(workbookImport && workbookImport.records.length > 0 && workbookImport.errors.length === 0);
  // Confirmation is tied to the exact mapping the user approved; any later edit requires re-confirming.
  const confirmed = ready && confirmedSettings === settingsKey;

  useEffect(() => { localStorage.setItem("tm-theme", theme); }, [theme]);
  useEffect(() => {
    listImports().then(setSavedImports).catch(() => setError("ไม่สามารถใช้พื้นที่จัดเก็บในเบราว์เซอร์ได้ ลองเปิดในหน้าต่างปกติของเบราว์เซอร์รุ่นปัจจุบัน"));
  }, []);
  useEffect(() => {
    if (!running) return undefined;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  function resetRun() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setResult(null);
  }

  async function loadFile(file) {
    if (!file) return;
    setError("");
    setNotice("");
    setIsReading(true);
    try {
      const inspected = await inspectFile(file);
      setExtraction(inspected);
      setOriginalFile(file);
      setSettings(makeSettings(inspected));
      setConfirmedSettings("");
      resetRun();
    } catch (readError) {
      setError(readError.message || "อ่านไฟล์นี้ไม่ได้");
    } finally {
      setIsReading(false);
    }
  }

  async function saveCurrent(status) {
    if (!extraction || !originalFile) return;
    setError("");
    const records = workbookImport?.records ?? [];
    const issues = workbookImport?.errors ?? [];
    const record = {
      id: crypto.randomUUID(),
      fileName: originalFile.name,
      fileSize: originalFile.size,
      fileType: extraction.kind,
      sourceType: extraction.kind === "workbook" ? "workbook" : "document",
      sheetName: extraction.kind === "workbook" ? "All included sheets" : "",
      status,
      updatedAt: new Date().toISOString(),
      originalFile,
      extraction,
      settings,
      records,
      validationIssues: issues,
      skippedRows: workbookImport?.skipped ?? 0,
      sheetSummary: workbookImport?.sheets.map(({ sheetName, included, sourceType, records: sheetRecords, errors: sheetErrors, skipped }) => ({
        sheetName, included, sourceType, recordCount: sheetRecords.length, errors: sheetErrors, skipped,
      })),
    };
    if (status === "Confirmed") setConfirmedSettings(settingsKey);
    try {
      await saveImport(record);
      setSavedImports(await listImports());
      setNotice(status === "Confirmed" ? "บันทึกข้อมูลที่ยืนยันแล้วไว้ในเครื่อง" : "บันทึกฉบับร่างไว้ในเครื่องแล้ว");
    } catch (saveError) {
      setError(saveError.message || "บันทึกข้อมูลในเครื่องไม่สำเร็จ");
    }
  }

  function openSaved(record) {
    const restored = Object.fromEntries(Object.entries(record.settings ?? {}).map(([name, config]) => [name, { ...config, included: config.included ?? config.sourceType !== "document" }]));
    setExtraction(record.extraction);
    setOriginalFile(record.originalFile);
    setSettings(restored);
    setConfirmedSettings(record.status === "Confirmed" ? JSON.stringify(restored) : "");
    resetRun();
    setError("");
    setNotice(`เปิด ${record.fileName} (${record.status === "Confirmed" ? "ยืนยันแล้ว" : "ฉบับร่าง"}) จากที่บันทึกในเครื่อง`);
  }

  async function deleteSaved(id) {
    try {
      await removeImport(id);
      setSavedImports(await listImports());
    } catch (deleteError) {
      setError(deleteError.message || "ลบข้อมูลที่บันทึกไม่สำเร็จ");
    }
  }

  function runScheduler() {
    if (!confirmed) return;
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/scheduler.worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setResult(null);
    setElapsedMs(0);
    setRunning(true);
    worker.onmessage = (event) => {
      const { ok, result: solved, error: failure, elapsedMs: took } = event.data;
      setElapsedMs(took);
      setResult(ok ? solved : { status: "error", errors: [failure], assumptions: [] });
      setRunning(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = (event) => {
      setResult({ status: "error", errors: [event.message || "ตัวจัดตารางหยุดทำงาน"], assumptions: [] });
      setRunning(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ records: workbookImport.records, options });
  }

  function cancelRun() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setResult({ status: "cancelled", errors: [], assumptions: [] });
  }

  return (
    <div className="sl-ground app-shell" data-theme={theme}>
      <aside className="sl-rail" aria-label="เมนูหลัก">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="brand-text"><strong className="h3">Timetable Maker</strong><small className="caption">ระบบจัดตารางสอนอัตโนมัติ</small></div>
        </div>
        <nav className="nav" aria-label="Main Navigation">
          {navigation.map((item, index) => (
            <button className={`nav-item ${active === item.id ? "is-active" : ""}`} key={item.id} type="button" onClick={() => setActive(item.id)}>
              <span className="nav-index">0{index + 1}</span><Icon>{item.icon}</Icon><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer"><span className="online-dot" /><div><strong className="caption">{running ? "กำลังจัดตาราง…" : "ระบบพร้อมใช้งาน"}</strong><small className="caption">ข้อมูลจัดเก็บในเครื่องนี้</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span className="caption">Timetable Maker</span><Icon>›</Icon><strong className="body-strong">{navigation.find((item) => item.id === active)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="sl-btn sl-btn--sm" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="สลับธีม">{theme === "light" ? "☾" : "☀"}</button>
          </div>
        </header>

        <Notice error={error} notice={notice} />

        {active === "input" && (
          <InputPage
            extraction={extraction} settings={settings} setSettings={setSettings} workbookImport={workbookImport}
            isReading={isReading} onFile={loadFile}
            savedImports={savedImports} onSave={saveCurrent} onOpenSaved={openSaved} onDeleteSaved={deleteSaved}
            onNext={() => setActive("processing")}
          />
        )}
        {active === "processing" && (
          <ProcessingPage
            source={extraction?.fileName} confirmed={confirmed} hasData={Boolean(extraction)}
            running={running} elapsedMs={elapsedMs} result={result}
            options={options} onOptionsChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
            onRun={runScheduler} onCancel={cancelRun} onBack={() => setActive("input")} onShowOutput={() => setActive("output")}
          />
        )}
        {active === "output" && <OutputPage result={result} onGoProcessing={() => setActive("processing")} />}
      </main>
    </div>
  );
}

export default App;
