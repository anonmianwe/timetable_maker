import { useEffect, useState } from 'react'
import { th } from './i18n/th'

const navigation = [
  { id: 'input', label: th.nav.input, icon: '↑' },
  { id: 'processing', label: th.nav.processing, icon: '◷' },
  { id: 'output', label: th.nav.output, icon: '▤' },
]

function Icon({ children }) {
  return <span className="icon" aria-hidden="true">{children}</span>
}

function StatusBadge({ tone = 'mute', children }) {
  const symbols = { ok: '✓', info: '◷', warn: '!', bad: '×', mute: '·' }
  return <span className={`sl-badge sl-badge--${tone}`}><Icon>{symbols[tone]}</Icon>{children}</span>
}

function App() {
  const [active, setActive] = useState('input')
  const [theme, setTheme] = useState('light')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('')
  const [started, setStarted] = useState(false)
  // MOCK ONLY: จำลอง progress ของหน้า Processing จนกว่าจะเชื่อม API จริง
  const [mockProgress, setMockProgress] = useState(0)

  const mockRunning = started && mockProgress < 100

  useEffect(() => {
    if (!started || mockProgress >= 100) return undefined
    const timer = window.setInterval(() => {
      setMockProgress((current) => Math.min(current + 10, 100))
    }, 500)
    return () => window.clearInterval(timer)
  }, [started, mockProgress])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    setFileName(file?.name ?? '')
    setFileType(file?.name?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Excel')
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
            <button className={`nav-item ${active === item.id ? 'is-active' : ''}`} key={item.id} type="button" onClick={() => setActive(item.id)}>
              <span className="nav-index">0{index + 1}</span><Icon>{item.icon}</Icon><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer"><span className="online-dot" /><div><strong className="caption">ระบบพร้อมใช้งาน</strong><small className="caption">ข้อมูลจัดเก็บในเครื่องนี้</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span className="caption">Timetable Maker</span><Icon>›</Icon><strong className="body-strong">{navigation.find((item) => item.id === active)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="sl-btn sl-btn--sm" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="สลับธีม">{theme === 'light' ? '☾' : '☀'}</button>
            <div className="user-chip"><span className="avatar">A</span><div className="user-info"><strong className="caption">ผู้ดูแลระบบ</strong><small className="caption">Admin</small></div></div>
          </div>
        </header>

        {active === 'input' && (
          <div className="sl-enter">
            <PageHeading eyebrow="01 / INPUT DATA" title={th.pages.input.title} description="นำเข้าไฟล์ข้อมูลรายวิชา ครู ห้องเรียน เวลา และโจทย์จากกรรมการ" status={<StatusBadge tone={fileName ? 'ok' : 'mute'}>{fileName ? 'พร้อมตรวจสอบ' : 'รอการนำเข้า'}</StatusBadge>} />
            <section className="sl-card sl-card--raised" aria-labelledby="upload-title">
              <div className="sl-card__head"><div><h3 className="sl-card__title" id="upload-title">อัปโหลดข้อมูลต้นทาง</h3><p className="small">รองรับ Excel และ PDF หลายไฟล์ ระบบจะเก็บต้นฉบับไว้เพื่ออ้างอิง</p></div><span className="sl-badge sl-badge--mute">ขั้นตอน 1 / 3</span></div>
              <label className="sl-dropzone" htmlFor="source-file"><span className="upload-icon">↑</span><strong className="body-strong">{fileName || 'ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์จากเครื่อง'}</strong><span className="caption">.xlsx, .xls, .pdf · ขนาดไม่เกิน 20 MB</span><span className="sl-btn sl-btn--pri">เลือกไฟล์</span><input id="source-file" type="file" accept=".xlsx,.xls,.pdf" onChange={handleFileChange} /></label>
              <div className="sl-help import-note"><Icon>i</Icon><span>{fileName ? `เลือก ${fileType} แล้ว: ${fileName} · กด “ไปประมวลผล” เพื่อเริ่มตรวจสอบ` : 'ระบบจะอ่านหัวตารางและโครงสร้างเอกสารก่อนเสนอการจับคู่ข้อมูลให้ตรวจสอบ'}</span></div>
              {fileName && <button className="sl-btn sl-btn--pri next-button" type="button" onClick={() => setActive('processing')}>ไปประมวลผล <Icon>→</Icon></button>}
            </section>
            <div className="content-grid">
              <InfoCard title="ขอบเขตข้อมูลที่รองรับ" eyebrow="SOURCE DATA"><p>รายวิชาและจำนวนคาบ · ครูและเวลาที่ไม่สะดวก · ห้องและประเภท · วันและคาบเรียน · โจทย์เพิ่มเติมจากกรรมการ</p></InfoCard>
              <InfoCard title="ไฟล์อ้างอิงที่ตรวจพบ" eyebrow="DOCUMENTS"><div className="file-list"><span>ข้อมูลรายวิชา.xlsx</span><span>แนวทางการปฏิบัติการจัดตารางสอน.pdf</span><span>แบบประเมินคะแนนการแข่งขัน.pdf</span></div></InfoCard>
            </div>
          </div>
        )}

        {active === 'processing' && (
          <div className="sl-enter">
            <PageHeading eyebrow="02 / PROCESSING STEPS" title="ประมวลผลและตรวจสอบ" description="วิเคราะห์ข้อมูล สร้างตารางตามข้อกำหนด และตรวจสอบความขัดแย้งจากผลจริง" status={<StatusBadge tone={started ? 'info' : 'mute'}>{started ? 'ตัวอย่างจำลอง' : 'ยังไม่เริ่ม'}</StatusBadge>} />
            <section className="sl-card sl-card--raised" aria-labelledby="process-title">
              <div className="sl-card__head"><div><h3 className="sl-card__title" id="process-title">ลำดับการประมวลผล</h3><p className="small">{fileName ? `แหล่งข้อมูล: ${fileName}` : 'กรุณากลับไปนำเข้าข้อมูลก่อนเริ่มประมวลผล'}</p></div><span className="sl-badge sl-badge--warn">ตัวอย่างจำลอง · ยังไม่เรียก API</span></div>
              {started && <div className="mock-progress" aria-live="polite"><div className="mock-progress__head"><strong>ความคืบหน้าจำลอง</strong><span className="mono">{mockProgress}%</span></div><div className="mock-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={mockProgress}><i style={{ '--v': `${mockProgress}%` }} /></div><p>ใช้เพื่อแสดงหน้าจอระหว่างรอผลจากเซิร์ฟเวอร์จริงเท่านั้น</p></div>}
              <ol className="process-list">
                {['อ่านและแยกโครงสร้างไฟล์', 'เสนอการจับคู่ฟิลด์ให้ตรวจสอบ', 'สร้างบล็อกเรียนแบบต่อเนื่อง', 'จัดตารางด้วยเงื่อนไข hard/soft', 'ตรวจครู ห้อง และกลุ่มเรียนซ้ำซ้อน', 'สรุปผลและเหตุผลกรณีจัดไม่ได้'].map((step, index) => {
                  const stepProgress = (index + 1) * (100 / 6)
                  const complete = started && mockProgress >= stepProgress
                  const activeStep = started && !complete && mockProgress >= index * (100 / 6)
                  return <li className={activeStep ? 'is-active' : ''} key={step}><span>{complete ? '✓' : index + 1}</span><div><strong>{step}</strong><small>{complete ? 'ตัวอย่างจำลองเสร็จแล้ว · ผลจริงต้องมาจาก API' : index < 2 ? 'รอการยืนยันข้อมูลจากผู้ใช้' : 'ตัวอย่างจำลอง · ยังไม่เรียก API'}</small></div><StatusBadge tone={complete ? 'ok' : activeStep ? 'info' : 'mute'}>{complete ? 'เสร็จ' : activeStep ? 'กำลังทำ' : 'รอ'}</StatusBadge></li>
                })}
              </ol>
              <div className="process-actions"><button className="sl-btn sl-btn--pri" type="button" onClick={() => { setStarted(true); setMockProgress(0) }} disabled={!fileName || mockRunning}>{mockRunning ? 'กำลังประมวลผลตัวอย่าง…' : started ? 'เริ่มตัวอย่างใหม่' : 'เริ่มประมวลผล'}</button>{!fileName && <span className="sl-hint">ต้องอัปโหลดไฟล์จากหน้า Input Data ก่อน</span>}</div>
            </section>
            <section className="sl-card sl-card--flat" aria-labelledby="rules-title"><div className="sl-card__head"><h3 className="sl-card__title" id="rules-title">เงื่อนไขที่จะตรวจ</h3><StatusBadge tone="info">19 กฎจากเอกสาร</StatusBadge></div><div className="rule-tags"><span>ปวช.1 ≤ คาบ 9</span><span>ระดับอื่น ≤ คาบ 11</span><span>พักคาบ 4–6</span><span>พฤหัสบดี 6–7</span><span>ครู/ห้อง/กลุ่มห้ามชน</span><span>เรียนต่อเนื่องครบคาบ</span></div></section>
          </div>
        )}

        {active === 'output' && (
          <div className="sl-enter">
            <PageHeading eyebrow="03 / OUTPUT DATA" title="ผลลัพธ์การจัดตาราง" description="แสดงผลจากระบบและรายงานสรุปผลการจัดตารางสอน" status={<StatusBadge tone="warn">รอตารางที่ผ่านการตรวจ</StatusBadge>} />
            <section className="sl-card sl-card--raised output-summary"><div><p className="eyebrow">SCHEDULE OUTPUT</p><h2>ยังไม่มีผลลัพธ์ที่ยืนยันแล้ว</h2><p className="small">ระบบจะไม่แสดงตารางสำหรับนักเรียนหรือครูจนกว่าสถานะจะเป็น verified</p></div><div className="output-actions"><button className="sl-btn" type="button" disabled>ส่งออก Excel</button><button className="sl-btn" type="button" disabled>ส่งออก PDF</button></div></section>
            <section className="sl-card sl-card--raised output-mock-card" aria-labelledby="output-mock-title">
              <div className="sl-card__head">
                <div>
                  <p className="eyebrow">MOCK OUTPUT · DEMO ONLY</p>
                  <h2 className="sl-card__title" id="output-mock-title">ผลลัพธ์ตารางสอนจำลอง</h2>
                  <p className="small">ข้อมูลนี้เป็นตัวอย่างเพื่อทดสอบการแสดงผล ยังไม่ใช่ผลจาก Solver หรือ Verifier จริง</p>
                </div>
                <StatusBadge tone="warn">ตัวอย่างจำลอง</StatusBadge>
              </div>
              <div className="mock-output-grid">
                <div className="mock-stat"><span>สถานะ</span><strong>ยังไม่ยืนยัน</strong><small>ต้องผ่าน verified ก่อนเผยแพร่</small></div>
                <div className="mock-stat"><span>จัดได้</span><strong>—</strong><small>รอผลจาก API จริง</small></div>
                <div className="mock-stat"><span>ข้อขัดแย้ง</span><strong>—</strong><small>ไม่คำนวณบนหน้าเว็บ</small></div>
                <div className="mock-stat"><span>คะแนนโทษ</span><strong>—</strong><small>รอผลตรวจจาก Verifier</small></div>
              </div>
              <div className="mock-table-wrap">
                <table className="mock-table"><thead><tr><th scope="col">มุมมอง</th><th scope="col">ข้อมูล</th><th scope="col">สถานะ</th><th scope="col">แหล่งผลลัพธ์</th></tr></thead><tbody><tr><th scope="row">กลุ่มเรียน</th><td>ยังไม่มีตารางยืนยัน</td><td><StatusBadge tone="mute">รอผล</StatusBadge></td><td className="mono">/api/runs/:id/views/group/:key</td></tr><tr><th scope="row">ครูผู้สอน</th><td>ยังไม่มีตารางยืนยัน</td><td><StatusBadge tone="mute">รอผล</StatusBadge></td><td className="mono">/api/runs/:id/views/teacher/:key</td></tr><tr><th scope="row">ห้องเรียน</th><td>ยังไม่มีตารางยืนยัน</td><td><StatusBadge tone="mute">รอผล</StatusBadge></td><td className="mono">/api/runs/:id/views/room/:key</td></tr></tbody></table>
              </div>
              <div className="mock-output-note"><Icon>i</Icon><span>MOCK ONLY: เมื่อเชื่อม API แล้ว ส่วนนี้จะรับเฉพาะผลลัพธ์ที่มีสถานะ verified และข้อมูลจาก endpoint จริง</span></div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, status }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 className="h1">{title}</h1><p className="body">{description}</p></div>{status}</div>
}

function InfoCard({ eyebrow, title, children }) {
  return <section className="sl-card"><p className="eyebrow">{eyebrow}</p><h3 className="sl-card__title">{title}</h3><div className="small card-copy">{children}</div></section>
}

export default App
