import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoadingState } from "../components/AsyncState";

const RequestFlowPage = lazy(() =>
  import("../pages/RequestFlowPage").then((module) => ({
    default: module.RequestFlowPage,
  })),
);
const CapacityEstimationPage = lazy(() =>
  import("../pages/CapacityEstimationPage").then((module) => ({
    default: module.CapacityEstimationPage,
  })),
);

export function App() {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="HLD with UI home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>HLD</strong>
            <small>with UI</small>
          </span>
        </Link>
        <div className="header-note">Learn by changing the system</div>
        <ThemeToggle />
      </header>
      <main id="main-content">
        <Suspense
          fallback={
            <div className="page-width standalone-state">
              <LoadingState />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/topics/request-flow" element={<RequestFlowPage />} />
            <Route
              path="/topics/capacity-estimation"
              element={<CapacityEstimationPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
