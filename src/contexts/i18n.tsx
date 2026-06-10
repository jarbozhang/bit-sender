import { createContext, useContext, useState, type ReactNode } from "react";
import { translate, type Lang } from "../lib/i18n";

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);
const KEY = "bitsender-v2-lang";

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return c;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const s = localStorage.getItem(KEY);
    if (s === "zh-CN" || s === "en-US") return s;
    return navigator.language?.startsWith("en") ? "en-US" : "zh-CN";
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem(KEY, l);
  };
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
