import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../api/types";
import { ModuleShell, type ModuleTab } from "./ModuleShell";

type View = "playground" | "study" | "architecture";
const tabs: ReadonlyArray<ModuleTab<View>> = [
  { id: "playground", label: "Playground" },
  { id: "study", label: "Study" },
  { id: "architecture", label: "Architecture" },
];
const topic: CatalogEntry = {
  id: "request-flow",
  kind: "topic",
  title: "Request Flow",
  summary: "Understand how requests move through a bounded service.",
  category: "Foundations",
  level: "Beginner",
  order: 1,
  status: "published",
  prerequisites: [],
  outcomes: ["Explain why a request waits."],
  capabilities: ["study", "simulation"],
  lessonPath: "topics/request-flow/lesson.md",
  questionsPath: "topics/request-flow/questions.json",
  resourcesPath: "topics/request-flow/resources.json",
  simulationIds: ["request-flow"],
  estimatorIds: [],
  contentVersion: "1.0.0",
  reviewedAt: "2026-09-23",
  sourceIds: ["source"],
};

describe("ModuleShell", () => {
  it("uses manual keyboard activation and connects tabs to the panel", () => {
    render(
      <MemoryRouter initialEntries={["/topics/request-flow?view=study"]}>
        <ModuleShell topic={topic} tabs={tabs} defaultView="playground">
          {(view) => <p>{view} content</p>}
        </ModuleShell>
      </MemoryRouter>,
    );

    const study = screen.getByRole("tab", { name: /Study/ });
    const architecture = screen.getByRole("tab", { name: /Architecture/ });
    const panel = screen.getByRole("tabpanel");
    expect(study).toHaveAttribute("aria-selected", "true");
    expect(study).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", study.id);
    expect(document.title).toBe("Study · Request Flow | HLD with UI");

    study.focus();
    fireEvent.keyDown(study, { key: "ArrowRight" });
    expect(architecture).toHaveFocus();
    expect(study).toHaveAttribute("aria-selected", "true");
    expect(architecture).toHaveAttribute("aria-selected", "false");

    fireEvent.click(architecture);
    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("architecture content")).toBeInTheDocument();
  });
});
