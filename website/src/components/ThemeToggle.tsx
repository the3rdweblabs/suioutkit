import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "light" | "dark";
type Preference = Theme | "auto";

const STORAGE_KEY = "suioutkit-theme";

function getStoredPreference(): Preference | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "auto") return stored as Preference;
  return null;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyPreference(pref: Preference) {
  const resolved = pref === "auto" ? systemTheme() : pref;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem(STORAGE_KEY, pref);
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<Preference>("auto");
  const resolved = pref === "auto" ? (typeof window !== "undefined" ? systemTheme() : "dark") : pref;

  useEffect(() => {
    const stored = getStoredPreference();
    const initial: Preference = stored ?? "auto";
    setPref(initial);
    applyPreference(initial);

    // Listen for system theme changes when preference is auto
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (localStorage.getItem(STORAGE_KEY) === "auto") {
        applyPreference("auto");
        // force re-render by updating state to same value (safe)
        setPref((p) => p);
      }
    };
    try {
      mq.addEventListener("change", handler);
    } catch (e) {
      // older browsers
      // @ts-ignore
      mq.addListener(handler);
    }

    return () => {
      try {
        mq.removeEventListener("change", handler);
      } catch (e) {
        // @ts-ignore
        mq.removeListener(handler);
      }
    };
  }, []);

  function cycle(): void {
    const next: Preference = pref === "auto" ? "dark" : pref === "dark" ? "light" : "auto";
    setPref(next);
    applyPreference(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={pref === "auto" ? `Follow system (${resolved})` : `Switch to ${pref === "dark" ? "light" : "dark"}`}
      title={pref === "auto" ? `Auto (${resolved})` : pref === "dark" ? "Dark" : "Light"}
    >
      {pref === "auto" ? (
        <Monitor size={18} strokeWidth={1.75} />
      ) : pref === "dark" ? (
        <Sun size={18} strokeWidth={1.75} />
      ) : (
        <Moon size={18} strokeWidth={1.75} />
      )}
    </button>
  );
}
