import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <article className="prose study-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => (
              <div
                className="study-scroll"
                role="region"
                aria-label="Scrollable code example"
                tabIndex={0}
              >
                <pre>{children}</pre>
              </div>
            ),
            table: ({ children }) => (
              <div
                className="study-scroll"
                role="region"
                aria-label="Scrollable lesson table"
                tabIndex={0}
              >
                <table>{children}</table>
              </div>
            ),
            th: ({ children, style }) => (
              <th scope="col" style={style}>
                {children}
              </th>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
