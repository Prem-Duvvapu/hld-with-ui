import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("hld-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Preferences remain usable in memory when storage is unavailable. */
  }
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("hld-theme", theme);
    } catch {
      /* Keep the current in-memory theme. */
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-button"
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Use ${next} theme`}
      title={`Use ${next} theme`}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
