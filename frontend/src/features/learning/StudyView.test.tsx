import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { StudyView } from "./StudyView";
// The queue lesson's authored worked-table excerpt; the browser journey checks
// the complete Java-delivered lesson. This fixture exercises renderer semantics.
const queueLesson = `
| Job | Decision at 0 ms | Start | Completion | Waiting | Successful latency |
| --- | --- | --- | --- | --- | --- |
| job-1 | Starts on worker-1 | 0 ms | 10 ms | 0 ms | 10 ms |
| job-2 | Waits | 10 ms | 20 ms | 10 ms | 20 ms |
| job-3 | Rejected | Unavailable | Unavailable | Unavailable | Unavailable |
| job-4 | Rejected | Unavailable | Unavailable | Unavailable | Unavailable |

| Choice | Helps when | Cost or limitation |
| --- | --- | --- |
| More waiting space | A bounded burst can drain before the caller's useful deadline | More admitted work may wait longer; it does not create worker capacity |
`;

it("renders the authored queue worked example as a semantic table with real column headers and preserved values", () => {
  render(<StudyView markdown={queueLesson} />);
  const tables = screen.getAllByRole("table");
  const worked = tables.find((table) =>
    within(table).queryByRole("columnheader", { name: "Job" }),
  )!;
  expect(worked).toBeDefined();
  expect(
    within(worked)
      .getAllByRole("columnheader")
      .map((header) => header.textContent),
  ).toEqual([
    "Job",
    "Decision at 0 ms",
    "Start",
    "Completion",
    "Waiting",
    "Successful latency",
  ]);
  for (const header of within(worked).getAllByRole("columnheader"))
    expect(header).toHaveAttribute("scope", "col");
  expect(
    within(within(worked).getByRole("row", { name: /job-2/ }))
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["job-2", "Waits", "10 ms", "20 ms", "10 ms", "20 ms"]);
  const region = worked.closest('[role="region"]') as HTMLElement;
  expect(region).toHaveAccessibleName("Scrollable lesson table");
  expect(region).toHaveAttribute("tabindex", "0");
  region.focus();
  expect(region).toHaveFocus();
  expect(tables).toHaveLength(2);
});
it("preserves wide code and indentation in a keyboard-focusable scrolling example", () => {
  const example = `  producer -> ${"waiting-slot -> ".repeat(20)}worker\n    first-in -> first-out\n`;
  render(
    <StudyView
      markdown={`# Example\n\n\`\`\`text\n${example}\`\`\``}
      title="Trace waiting separately"
      guidance="Read the example, then change a condition."
    />,
  );
  const region = screen.getByRole("region", {
    name: "Scrollable code example",
  });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region.querySelector("pre code")!.textContent).toBe(example);
  region.focus();
  expect(region).toHaveFocus();
  expect(
    screen.getByRole("heading", { name: "Trace waiting separately" }),
  ).toBeVisible();
});
it("keeps raw HTML inert while allowing supported Markdown tables", () => {
  const { container } = render(
    <StudyView
      markdown={
        '<script>window.lessonInjected = true</script>\n\n<img src="missing" onerror="window.lessonInjected = true" />\n\n| Job | Status |\n| --- | --- |\n| job-1 | Completed |'
      }
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "scope",
    "col",
  );
  expect(screen.getByRole("cell", { name: "Completed" })).toBeVisible();
});
