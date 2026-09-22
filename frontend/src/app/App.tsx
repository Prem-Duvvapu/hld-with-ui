import { Route, Routes } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { RequestFlowPage } from "../pages/RequestFlowPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ThemeToggle } from "../components/ThemeToggle";

export function App() {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="HLD with UI home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>HLD</strong>
            <small>with UI</small>
          </span>
        </a>
        <div className="header-note">Learn by changing the system</div>
        <ThemeToggle />
      </header>
      <main id="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/topics/request-flow" element={<RequestFlowPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
