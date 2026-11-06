import { useEffect, useState } from "react";
import { inspectFile } from "./lib/fileReader.js";
import {
  getFieldLabel,
  getFieldsForSource,
  getSourceTypes,
  guessSourceType,
  suggestColumnMappings,
  suggestHeaderRow,
} from "./lib/mapping.js";
import { listImports, removeImport, saveImport } from "./lib/storage.js";
import { requestStructureProposal } from "./lib/aiAdapter.js";

const REQUIRED_FIELDS = {
  courses: ["courseCode", "courseName"],
  teachers: ["teacherName"],
  rooms: ["roomName"],
  availability: ["availability"],
  constraints: ["requirements"],
};

function makeSettings(extraction) {
  if (extraction.kind === "pdf") {
    return {
      pdf: { sourceType: "document", headerRow: 1, mappings: [] },
    };
  }

  return Object.fromEntries(
    extraction.sheets.map((sheet) => {
      const hint = guessSourceType(sheet.name);
      const sourceType = hint === "document" ? "courses" : hint;
      const headerRow = suggestHeaderRow(sheet.rows, sourceType);
      const header = sheet.rows.find((row) => row.number === headerRow)?.cells ?? [];
      const columnCount = sheet.rows.reduce((max, row) => Math.max(max, row.cells.length), header.length);
      const headerCells = Array.from({ length: columnCount }, (_, index) => header[index] ?? "");
      return [sheet.name, {
        sourceType,
        headerRow,
        mappings: suggestColumnMappings(headerCells, sourceType),
      }];
    }),
  );
}

function getMappedRows(sheet, headerRow, mappings) {
  if (!sheet) return { records: [], errors: [], skipped: 0 };
  const errors = [];
  const records = [];
  let skipped = 0;

  for (const row of sheet.rows) {
    if (row.number <= headerRow || !row.cells.some((cell) => String(cell).trim())) continue;
    const record = {};
    mappings.forEach((field, index) => {
      const value = String(row.cells[index] ?? "").trim();
      if (field && value) record[field] = value;
    });
    if (Object.keys(record).length === 0) {
      skipped += 1;
      continue;
    }

    records.push({ sourceRow: row.number, ...record });
  }

  return { records, errors, skipped };
}

function validateRecords(records, sourceType) {
  if (sourceType === "document") return [];
  const requiredChoices = REQUIRED_FIELDS[sourceType] ?? [];
  if (requiredChoices.length === 0) return ["Choose a data type before confirming this import."];

  const availableFields = new Set(records.flatMap((record) => Object.keys(record)));
  if (!requiredChoices.some((field) => availableFields.has(field))) {
    const labels = requiredChoices.map(getFieldLabel).join(" or ");
    return [`Map a column to ${labels} before confirming.`];
  }

  const primaryFields = requiredChoices;
  const invalidRows = records
    .filter((record) => !primaryFields.some((field) => record[field]))
    .map((record) => record.sourceRow);
  if (invalidRows.length) {
    return [`Rows ${invalidRows.join(", ")} have data but no required ${primaryFields.map(getFieldLabel).join(" / ")} value.`];
  }
  return [];
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [savedImports, setSavedImports] = useState([]);
  const [extraction, setExtraction] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [settings, setSettings] = useState({});
  const [activeSheetName, setActiveSheetName] = useState("");
  const [proposal, setProposal] = useState("");
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem("ingest-ai-endpoint") ?? "");
  const [model, setModel] = useState(() => localStorage.getItem("ingest-ai-model") ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    listImports()
      .then((records) => {
        if (mounted) setSavedImports(records);
      })
      .catch(() => {
        if (mounted) setError("Local browser storage is unavailable. Try a current browser in a normal window.");
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem("ingest-ai-endpoint", endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem("ingest-ai-model", model);
  }, [model]);

  const activeKey = extraction?.kind === "pdf" ? "pdf" : activeSheetName;
  const activeSettings = settings[activeKey] ?? { sourceType: "document", headerRow: 1, mappings: [] };
  const activeSheet = extraction?.kind === "workbook"
    ? extraction.sheets.find((sheet) => sheet.name === activeSheetName)
    : null;
  const headerRow = activeSheet?.rows.find((row) => row.number === activeSettings.headerRow);
  const headers = headerRow?.cells ?? [];
  const columnCount = activeSheet?.rows.reduce((max, row) => Math.max(max, row.cells.length), headers.length) ?? headers.length;
  const columns = Array.from({ length: columnCount }, (_, index) => headers[index] ?? "");
  const fields = getFieldsForSource(activeSettings.sourceType);
  const mapped = getMappedRows(activeSheet, activeSettings.headerRow, activeSettings.mappings);
  const validationErrors = validateRecords(mapped.records, activeSettings.sourceType);

  async function loadFile(file) {
    if (!file) return;
    setError("");
    setNotice("");
    setProposal("");
    setExtraction(null);
    setSettings({});
    setIsReading(true);
    setOriginalFile(file);
    try {
      const result = await inspectFile(file);
      const nextSettings = makeSettings(result);
      setExtraction(result);
      setSettings(nextSettings);
      setActiveSheetName(result.kind === "workbook" ? result.sheets[0]?.name ?? "" : "");
    } catch (readError) {
      setExtraction(null);
      setSettings({});
      setError(readError.message || "Could not read this file.");
    } finally {
      setIsReading(false);
    }
  }

  function updateActiveSettings(patch) {
    setSettings((current) => ({
      ...current,
      [activeKey]: { ...activeSettings, ...patch },
    }));
  }

  function changeSourceType(sourceType) {
    if (activeSheet) {
      const nextHeader = suggestHeaderRow(activeSheet.rows, sourceType);
      const nextHeaders = activeSheet.rows.find((row) => row.number === nextHeader)?.cells ?? [];
      const columnCount = activeSheet.rows.reduce((max, row) => Math.max(max, row.cells.length), nextHeaders.length);
      const headerCells = Array.from({ length: columnCount }, (_, index) => nextHeaders[index] ?? "");
      updateActiveSettings({
        sourceType,
        headerRow: nextHeader,
        mappings: suggestColumnMappings(headerCells, sourceType),
      });
      return;
    }
    updateActiveSettings({ sourceType });
  }

  function changeHeaderRow(value) {
    const nextHeaderRow = Number(value);
    const nextHeaders = activeSheet?.rows.find((row) => row.number === nextHeaderRow)?.cells ?? [];
    const headerCells = Array.from({ length: columnCount }, (_, index) => nextHeaders[index] ?? "");
    updateActiveSettings({
      headerRow: nextHeaderRow,
      mappings: suggestColumnMappings(headerCells, activeSettings.sourceType),
    });
  }

  function changeMapping(columnIndex, fieldKey) {
    const nextMappings = [...activeSettings.mappings];
    if (fieldKey) {
      nextMappings.forEach((value, index) => {
        if (index !== columnIndex && value === fieldKey) nextMappings[index] = "";
      });
    }
    nextMappings[columnIndex] = fieldKey;
    updateActiveSettings({ mappings: nextMappings });
  }

  async function askAi() {
    if (!extraction) return;
    setError("");
    setNotice("");
    setIsAskingAi(true);
    try {
      const contentObject = extraction.kind === "workbook"
        ? { sheetName: activeSheet?.name, rows: activeSheet?.rows.slice(0, 100) }
        : { pages: extraction.pages.slice(0, 20).map((page) => ({ number: page.number, text: page.text.slice(0, 2500) })) };
      const serializedContent = JSON.stringify(contentObject);
      const content = serializedContent.length > 60000
        ? `${serializedContent.slice(0, 60000)}\n[Content truncated for the proposal request.]`
        : serializedContent;
      const result = await requestStructureProposal({
        endpoint: endpoint.trim(),
        model: model.trim(),
        content,
        sourceName: originalFile?.name ?? extraction.fileName,
      });
      setProposal(result);
      setNotice("AI proposal received. Review it and the source data before confirming an import.");
    } catch (aiError) {
      setError(aiError.message || "Could not reach the local AI service.");
    } finally {
      setIsAskingAi(false);
    }
  }

  async function saveCurrent(status) {
    if (!extraction || !originalFile) return;
    setError("");
    setNotice("");
    const records = extraction.kind === "workbook" ? mapped.records : [];
    const issues = extraction.kind === "workbook"
      ? validateRecords(records, activeSettings.sourceType)
      : [];

    if (status === "Confirmed" && issues.length) {
      setError(issues.join(" "));
      return;
    }
    if (status === "Confirmed" && records.length === 0) {
      setError("No mapped records were found. Save a draft or adjust the header and column mapping.");
      return;
    }

    const record = {
      id: crypto.randomUUID(),
      fileName: originalFile.name,
      fileSize: originalFile.size,
      fileType: extraction.kind,
      sourceType: activeSettings.sourceType,
      sheetName: activeSheetName,
      status,
      updatedAt: new Date().toISOString(),
      originalFile,
      extraction,
      settings,
      proposal,
      records,
      validationIssues: issues,
      skippedRows: mapped.skipped,
    };

    try {
      await saveImport(record);
      setSavedImports(await listImports());
      setNotice(status === "Confirmed" ? "Confirmed records saved locally." : "Review draft saved on this device.");
    } catch (saveError) {
      setError(saveError.message || "Could not save this import locally.");
    }
  }

  function openSaved(record) {
    setExtraction(record.extraction);
    setOriginalFile(record.originalFile);
    setSettings(record.settings);
    setActiveSheetName(record.sheetName ?? "");
    setProposal(record.proposal ?? "");
    setError("");
    setNotice(`Opened ${record.status.toLocaleLowerCase()} from local storage.`);
  }

  async function deleteSaved(id) {
    try {
      await removeImport(id);
      setSavedImports(await listImports());
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the saved import.");
    }
  }

  const rowCount = extraction?.kind === "workbook"
    ? activeSheet?.rows.length ?? 0
    : extraction?.pages.length ?? 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Timetable Maker home">
          <span className="brand-mark">T</span>
          <span>Timetable Maker</span>
        </a>
        <div className="topbar-right">
          <span className="local-indicator"><span />On this device</span>
          <span className="topbar-section">DATA INTAKE / 01</span>
        </div>
      </header>

      <div className="workspace" id="top">
        <aside className="sidebar">
          <div className="sidebar-label">WORKSPACE</div>
          <div className="side-link active"><span className="side-index">01</span> Import data</div>
          <div className="side-link muted"><span className="side-index">02</span> Review records</div>
          <div className="side-link muted"><span className="side-index">03</span> Build timetable</div>

          <div className="saved-section">
            <div className="sidebar-label">LOCAL IMPORTS</div>
            {savedImports.length === 0 ? (
              <p className="empty-saved">No saved imports yet.</p>
            ) : (
              <ul className="saved-list">
                {savedImports.map((record) => (
                  <li key={record.id} className="saved-item">
                    <button className="saved-open" onClick={() => openSaved(record)} title={`Open ${record.fileName}`}>
                      <span className="saved-type">{record.fileType === "pdf" ? "PDF" : "XLSX"}</span>
                      <span className="saved-file-name">{record.fileName}</span>
                      <span className="saved-status">{record.status}</span>
                    </button>
                    <button className="saved-delete" onClick={() => deleteSaved(record.id)} aria-label={`Delete ${record.fileName}`} title="Delete import">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sidebar-foot">Draft files stay in this browser.</div>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">TIMETABLE DATA / INGEST</p>
              <h1>Bring in source data</h1>
              <p className="page-subtitle">Inspect a workbook or document, map its fields, and keep the original close at hand.</p>
            </div>
            <span className="step-badge"><b>01</b> / 03</span>
          </div>

          <section className="upload-section" aria-labelledby="upload-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">SOURCE FILE</span>
                <h2 id="upload-title">Upload a workbook or PDF</h2>
              </div>
              <span className="format-note">XLSX · PDF · up to 25 MB</span>
            </div>
            <label
              className={`drop-zone${isDragging ? " is-dragging" : ""}${isReading ? " is-loading" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                loadFile(event.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => loadFile(event.target.files[0])}
              />
              <span className="upload-glyph" aria-hidden="true">↑</span>
              <span className="drop-title">{isReading ? "Reading file…" : "Drop a file here"}</span>
              <span className="drop-copy">or <span className="browse-link">browse your device</span></span>
              <span className="drop-foot">Files are read in this browser. Nothing is uploaded automatically.</span>
            </label>
          </section>

          {(error || notice) && (
            <div className={`message ${error ? "message-error" : "message-success"}`} role={error ? "alert" : "status"}>
              {error || notice}
            </div>
          )}

          {extraction && (
            <section className="review-section" aria-labelledby="review-title">
              <div className="section-heading review-heading">
                <div>
                  <span className="section-kicker">EXTRACTION PREVIEW</span>
                  <h2 id="review-title">Review before importing</h2>
                </div>
                <div className="file-summary">
                  <span className="file-type-tag">{extraction.kind === "pdf" ? "PDF" : "XLSX"}</span>
                  <span className="file-summary-name">{extraction.fileName}</span>
                  <span className="file-summary-size">{formatBytes(extraction.fileSize)}</span>
                </div>
              </div>

              {extraction.kind === "workbook" ? (
                <>
                  <div className="sheet-tabs" role="tablist" aria-label="Workbook sheets">
                    {extraction.sheets.map((sheet) => (
                      <button
                        key={sheet.name}
                        className={`sheet-tab${activeSheetName === sheet.name ? " selected" : ""}`}
                        role="tab"
                        aria-selected={activeSheetName === sheet.name}
                        onClick={() => { setActiveSheetName(sheet.name); setProposal(""); }}
                      >
                        {sheet.name}<span>{sheet.rows.length}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mapping-toolbar">
                    <label className="control-field">
                      <span>Data type</span>
                      <select value={activeSettings.sourceType} onChange={(event) => changeSourceType(event.target.value)}>
                        {getSourceTypes().map((type) => <option value={type.key} key={type.key}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="control-field header-row-control">
                      <span>Header row</span>
                      <select value={activeSettings.headerRow} onChange={(event) => changeHeaderRow(event.target.value)}>
                        {activeSheet?.rows.slice(0, 30).map((row) => (
                          <option value={row.number} key={row.number}>Row {row.number}: {row.cells.filter(Boolean).slice(0, 3).join(" · ") || "blank"}</option>
                        ))}
                      </select>
                    </label>
                    <div className="row-count">{rowCount} non-empty rows</div>
                  </div>

                  <div className="mapping-explainer">Map the columns you recognize. Unmapped columns remain in the source file and are not used by the scheduler.</div>
                  <div className="mapping-grid">
                    {columns.map((header, index) => (
                      <label className="mapping-item" key={`${index}-${header}`}>
                        <span className="mapping-header" title={String(header || `Column ${index + 1}`)}>{header || `Column ${index + 1}`}</span>
                        <select value={activeSettings.mappings[index] ?? ""} onChange={(event) => changeMapping(index, event.target.value)}>
                          <option value="">Keep as source only</option>
                          {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                        </select>
                      </label>
                    ))}
                    {headers.length === 0 && <p className="no-headers">Choose a header row to begin field mapping.</p>}
                  </div>

                  {validationErrors.length > 0 && activeSettings.sourceType !== "document" && (
                    <div className="validation-note">{validationErrors.join(" ")}</div>
                  )}
                  {mapped.skipped > 0 && <div className="skip-note">{mapped.skipped} non-empty rows have no mapped values and will stay in the source only.</div>}

                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th className="row-number">Row</th>{columns.map((header, index) => <th key={`${index}-${header}`}>{header || `Column ${index + 1}`}</th>)}</tr>
                      </thead>
                      <tbody>
                        {activeSheet?.rows.filter((row) => row.number > activeSettings.headerRow).slice(0, 12).map((row) => (
                          <tr key={row.number}>
                            <td className="row-number">{row.number}</td>
                            {columns.map((_, index) => <td key={index}>{row.cells[index] || <span className="empty-cell">—</span>}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot">Showing up to 12 rows. All extracted rows are kept in the saved source.</div>
                </>
              ) : (
                <>
                  <div className="mapping-toolbar pdf-toolbar">
                    <label className="control-field">
                      <span>Document use</span>
                      <select value={activeSettings.sourceType} onChange={(event) => changeSourceType(event.target.value)}>
                        {getSourceTypes().map((type) => <option value={type.key} key={type.key}>{type.label}</option>)}
                      </select>
                    </label>
                    <div className="row-count">{extraction.pages.length} pages</div>
                  </div>
                  {extraction.likelyScanned && (
                    <div className="validation-note">Little or no selectable text was found. This may be a scanned PDF; OCR is not included in this first version.</div>
                  )}
                  <div className="pdf-pages">
                    {extraction.pages.map((page) => (
                      <article className="pdf-page" key={page.number}>
                        <div className="pdf-page-heading"><span>Page {page.number}</span><span>{page.text.length} characters</span></div>
                        <p>{page.text || "No selectable text on this page."}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}

              <section className="ai-panel" aria-labelledby="ai-title">
                <div className="ai-panel-heading">
                  <div>
                    <span className="section-kicker">OPTIONAL LOCAL AI</span>
                    <h3 id="ai-title">Ask AI to propose a structure</h3>
                  </div>
                  <span className="ai-local-badge">Runs on your network</span>
                </div>
                <p className="ai-copy">The AI may suggest a different shape for each file. Its response is shown as a proposal; review it before using any values.</p>
                <div className="ai-controls">
                  <label className="control-field endpoint-field">
                    <span>OpenAI-compatible chat URL</span>
                    <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://192.168.1.20:11434/v1/chat/completions" inputMode="url" />
                  </label>
                  <label className="control-field model-field">
                    <span>Model name</span>
                    <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model served by the other laptop" />
                  </label>
                  <button className="button-secondary ai-button" onClick={askAi} disabled={isAskingAi || !endpoint.trim()}>
                    {isAskingAi ? "Waiting for AI…" : "Request proposal"}
                  </button>
                </div>
                <div className="ai-footnote">Only extracted text is sent, and only after you request a proposal. The AI server must allow browser requests from this app.</div>
                {proposal && <pre className="proposal-output">{proposal}</pre>}
              </section>

              <div className="review-actions">
                <div className="save-context">{extraction.kind === "pdf" ? "Save the source and extraction for later review." : `${mapped.records.length} mapped records · ${mapped.skipped} source-only rows`}</div>
                <button className="button-secondary" onClick={() => saveCurrent("Draft")}>Save review draft</button>
                {extraction.kind === "workbook" && activeSettings.sourceType !== "document" && (
                  <button className="button-primary" onClick={() => saveCurrent("Confirmed")} disabled={validationErrors.length > 0 || mapped.records.length === 0}>
                    Confirm &amp; save records
                  </button>
                )}
                {extraction.kind === "pdf" && (
                  <button className="button-primary" onClick={() => saveCurrent("Reference")}>Save PDF reference</button>
                )}
              </div>
            </section>
          )}

          {!extraction && !isReading && (
            <section className="empty-workspace">
              <div className="empty-mark">01</div>
              <div><h2>Start with the source, not a template.</h2><p>Each workbook or PDF can have a different layout. Review the extracted content and choose its meaning before it becomes scheduling data.</p></div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
