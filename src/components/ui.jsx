export function Icon({ children }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export function StatusBadge({ tone = "mute", children }) {
  const symbols = { ok: "✓", info: "◷", warn: "!", bad: "×", mute: "·" };
  return <span className={`sl-badge sl-badge--${tone}`}><Icon>{symbols[tone]}</Icon>{children}</span>;
}

export function PageHeading({ eyebrow, title, description, status }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="h1">{title}</h1>
        <p className="body">{description}</p>
      </div>
      {status}
    </div>
  );
}

export function InfoCard({ eyebrow, title, children }) {
  return (
    <section className="sl-card">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="sl-card__title">{title}</h3>
      <div className="small card-copy">{children}</div>
    </section>
  );
}

export function MessageList({ tone = "bad", items }) {
  if (!items?.length) return null;
  return (
    <ul className={`message-list message-list--${tone}`}>
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  );
}

export function Notice({ error, notice }) {
  if (!error && !notice) return null;
  return (
    <div className={`notice ${error ? "notice--bad" : "notice--ok"}`} role={error ? "alert" : "status"}>
      <Icon>{error ? "×" : "✓"}</Icon>
      <span>{error || notice}</span>
    </div>
  );
}
