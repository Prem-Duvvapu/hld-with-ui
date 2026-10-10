import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ThemeToggle } from "../components/ThemeToggle";
import LearningNetworkNav from "../components/LearningNetworkNav";
import { LoadingState } from "../components/AsyncState";

const SearchPage = lazy(() =>
  import("../pages/SearchPage").then((module) => ({
    default: module.SearchPage,
  })),
);
const BookmarksPage = lazy(() =>
  import("../pages/BookmarksPage").then((module) => ({
    default: module.BookmarksPage,
  })),
);

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
const RateLimiterPage = lazy(() =>
  import("../pages/RateLimiterPage").then((module) => ({
    default: module.RateLimiterPage,
  })),
);
const CacheAsidePage = lazy(() =>
  import("../pages/CacheAsidePage").then((module) => ({
    default: module.CacheAsidePage,
  })),
);
const WorkshopPage = lazy(() =>
  import("../pages/WorkshopPage").then((module) => ({
    default: module.WorkshopPage,
  })),
);

export function App() {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <LearningNetworkNav />
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
        <nav className="header-tools" aria-label="Learning tools">
          <Link className="header-search" to="/search">
            Search
          </Link>
          <Link className="header-search" to="/bookmarks">
            Bookmarks
          </Link>
        </nav>
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
            <Route path="/search" element={<SearchPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/topics/request-flow" element={<RequestFlowPage />} />
            <Route
              path="/topics/capacity-estimation"
              element={<CapacityEstimationPage />}
            />
            <Route
              path="/topics/distributed-rate-limiter"
              element={<RateLimiterPage />}
            />
            <Route path="/topics/cache-aside" element={<CacheAsidePage />} />
            <Route path="/case-studies/:id" element={<WorkshopPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
