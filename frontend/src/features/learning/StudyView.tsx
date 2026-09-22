import ReactMarkdown from "react-markdown";

export function StudyView({
  markdown,
  title = "Follow one request before scaling the system.",
  guidance = "Use the interactive view after each section. Change one variable and explain the result before reading further.",
}: {
  markdown: string;
  title?: string;
  guidance?: string;
}) {
  return (
    <div className="reading-layout">
      <aside className="reading-aside">
        <p className="eyebrow">Mental model</p>
        <h2>{title}</h2>
        <p>{guidance}</p>
      </aside>
      <article className="prose">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
