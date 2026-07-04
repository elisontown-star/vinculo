import { createContext, useContext, useState, type ReactNode } from 'react';
import { S, O, type Lang } from './locales';

const STORAGE = 'vinculo_lang';
function initial(): Lang {
  const s = localStorage.getItem(STORAGE) as Lang | null;
  if (s && ['pt', 'en', 'es', 'fr'].includes(s)) return s;
  const nav = navigator.language.slice(0, 2);
  return (['pt', 'en', 'es', 'fr'].includes(nav) ? nav : 'pt') as Lang;
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  o: (set: string) => string[];
  te: (code: string) => string;
};
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  function setLang(l: Lang) {
    localStorage.setItem(STORAGE, l);
    document.documentElement.lang = l === 'pt' ? 'pt-BR' : l;
    setLangState(l);
  }
  const t = (key: string) => S[lang][key] ?? S.pt[key] ?? key;
  const o = (set: string) => O[set]?.[lang] ?? O[set]?.pt ?? [];
  const te = (code: string) => S[lang]['err.' + code] ?? S.pt['err.' + code] ?? S[lang]['err.generic'];
  return <I18nContext.Provider value={{ lang, setLang, t, o, te }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n fora do provider');
  return ctx;
}
