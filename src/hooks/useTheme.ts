import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "yabot-theme";

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

// "system" means no explicit choice — CSS's own prefers-color-scheme media
// query already handles that case, so the only thing this needs to do is
// add/remove the override attribute. Mirrors the same-key script in
// index.html that runs before paint, so there's no flash on load.
function applyTheme(mode: ThemeMode) {
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(mode: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, mode);
    setThemeState(mode);
  }

  return { theme, setTheme };
}
