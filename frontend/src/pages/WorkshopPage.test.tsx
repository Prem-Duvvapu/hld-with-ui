import catalogFixture from "../../../content/catalog.json";
import workshopFixture from "../../../content/case-studies/url-shortener/workshop.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { CaseStudyDetail } from "../api/types";
import { WorkshopPage } from "./WorkshopPage";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: { caseStudy: vi.fn() },
}));
const detail: CaseStudyDetail = {
  entry: catalogFixture.find(
    (entry) => entry.id === "url-shortener",
  )! as CaseStudyDetail["entry"],
  workshop: workshopFixture as CaseStudyDetail["workshop"],
};
function view(id = "url-shortener") {
  return render(
    <MemoryRouter initialEntries={[`/case-studies/${id}`]}>
      <Routes>
        <Route path="/case-studies/:id" element={<WorkshopPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.resetAllMocks());
it("loads one implemented design tab and marks the workshop as draft", async () => {
  vi.mocked(api.caseStudy).mockResolvedValue(detail);
  view();
  expect(
    await screen.findByRole("heading", { name: detail.entry.title, level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Draft workshop" })).toBeVisible();
});
it("provides a working retry after a failed Java content request", async () => {
  vi.mocked(api.caseStudy)
    .mockRejectedValueOnce(new ApiClientError("Workshop unavailable."))
    .mockResolvedValueOnce(detail);
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Workshop unavailable.",
  );
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(
    await screen.findByRole("heading", { name: detail.entry.title, level: 1 }),
  ).toBeVisible();
  expect(api.caseStudy).toHaveBeenCalledTimes(2);
});
it("handles an unknown case without presenting a substitute workshop", async () => {
  vi.mocked(api.caseStudy).mockRejectedValue(
    new ApiClientError("Unknown case.", 404),
  );
  view("missing");
  expect(
    await screen.findByRole("heading", {
      name: "That route is outside the system.",
    }),
  ).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
it("rejects a content-version mismatch before an answer can be changed", async () => {
  vi.mocked(api.caseStudy).mockResolvedValue({
    ...detail,
    workshop: { ...detail.workshop, contentVersion: "9.0.0" },
  });
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
