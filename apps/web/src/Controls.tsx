import { useI18n } from './i18n';
import { useTheme } from './theme';
import { LANGS, type Lang } from './locales';

export function Controls() {
  const { lang, setLang, t } = useI18n();
  const [theme, toggle] = useTheme();
  return (
    <div className="controls">
      <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Idioma">
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <button className="theme-btn" onClick={toggle} title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')} aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}
