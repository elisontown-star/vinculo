import { useState } from 'react';
import { api, setToken, clearToken, setUser } from './lib/api';
import { useI18n } from './i18n';
import { Controls } from './Controls';
import Workspace from './Workspace';

const VTECH_LOGO =
  'https://vtechit.com.br/wp-content/uploads/2026/05/cropped-Blue-and-Orange-Modern-Letter-V-Technology-Logo.png';

export function Brand() {
  const { t } = useI18n();
  return (
    <div className="brand">
      <img
        className="brand-logo"
        src={VTECH_LOGO}
        alt="Vtech IT"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="brand-text">
        <span className="word">Vínculo</span>
        <span className="tag">{t('brand.tag')}</span>
      </div>
    </div>
  );
}

function Auth({ onDone }: { onDone: () => void }) {
  const { t, te } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [clinicName, setClinicName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      const strong =
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
      if (!strong) {
        setError(t('pw.tooWeak'));
        return;
      }
    }
    setBusy(true);
    try {
      const res =
        mode === 'register'
          ? await api.register({ clinicName, name, email, password })
          : await api.login({ email, password });
      setToken(res.token);
      setUser(res.user);
      onDone();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-controls">
        <Controls />
      </div>

      <div className="auth-hero">
        <Brand />
        <h2 className="hero-title">{t('hero.title')}</h2>
        <p className="hero-sub">{t('hero.sub')}</p>
        <ul className="hero-points">
          <li>{t('hero.p1')}</li>
          <li>{t('hero.p2')}</li>
          <li>{t('hero.p3')}</li>
        </ul>
        <span className="hero-foot">{t('hero.foot')}</span>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h1>{mode === 'register' ? t('auth.registerTitle') : t('auth.loginTitle')}</h1>
          <p className="sub">{mode === 'register' ? t('auth.registerSub') : t('auth.loginSub')}</p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="clinic">{t('lbl.clinicName')}</label>
                  <input id="clinic" value={clinicName} onChange={(e) => setClinicName(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="name">{t('lbl.yourName')}</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="email">{t('lbl.email')}</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">{t('lbl.password')}</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            {mode === 'register' && password.length > 0 && (
              <ul className="pw-rules">
                <li className={password.length >= 8 ? 'ok' : ''}>{t('pw.length')}</li>
                <li className={/[a-z]/.test(password) ? 'ok' : ''}>{t('pw.lower')}</li>
                <li className={/[A-Z]/.test(password) ? 'ok' : ''}>{t('pw.upper')}</li>
                <li className={/[0-9]/.test(password) ? 'ok' : ''}>{t('pw.number')}</li>
                <li className={/[^A-Za-z0-9]/.test(password) ? 'ok' : ''}>{t('pw.special')}</li>
              </ul>
            )}
            <button className="btn" disabled={busy}>
              {busy ? t('btn.wait') : mode === 'register' ? t('btn.createClinic') : t('btn.enter')}
            </button>
          </form>

          <div className="switch">
            {mode === 'register' ? (
              <>
                {t('sw.hasAccount')} <button onClick={() => setMode('login')}>{t('sw.enter')}</button>
              </>
            ) : (
              <>
                {t('sw.newClinic')} <button onClick={() => setMode('register')}>{t('sw.register')}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!localStorage.getItem('vinculo_token'));

  function logout() {
    clearToken();
    localStorage.removeItem('vinculo_user');
    setAuthed(false);
  }

  return authed ? <Workspace onLogout={logout} /> : <Auth onDone={() => setAuthed(true)} />;
}
