import { Analytics } from "@vercel/analytics/react";
import { redactAnalyticsUrl } from "./analytics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      {import.meta.env.PROD && <Analytics beforeSend={redactAnalyticsUrl} />}
    </BrowserRouter>
  </StrictMode>,
);
