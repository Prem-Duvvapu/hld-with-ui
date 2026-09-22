import ReactMarkdown from "react-markdown";

export function StudyView({ markdown }: { markdown: string }) {
  return (
    <div className="reading-layout">
      <aside className="reading-aside">
        <p className="eyebrow">Mental model</p>
        <h2>Follow one request before scaling the system.</h2>
        <p>
          Use the playground after each section. Change one variable and explain
          the result before reading further.
        </p>
      </aside>
      <article className="prose">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
