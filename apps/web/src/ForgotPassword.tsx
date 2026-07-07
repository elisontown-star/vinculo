import { useState } from 'react';
import { api } from './lib/api';
import { useI18n } from './i18n';

export function ForgotPassword({
  onBack,
  initialEmail = '',
  initialCode = '',
}: {
  onBack: () => void;
  initialEmail?: string;
  initialCode?: string;
}) {
  const { t, te } = useI18n();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>(initialCode ? 'reset' : 'email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setStep('reset'); // sempre avança (não revela se o e-mail existe)
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
    setBusy(true);
    try {
      await api.resetPassword({ email, code, password });
      setStep('done');
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="fp-box">
        <h1>{t('fp.doneTitle')}</h1>
        <p className="sub">{t('fp.doneSub')}</p>
        <button className="btn" onClick={onBack}>{t('fp.backToLogin')}</button>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <div className="fp-box">
        <h1>{t('fp.resetTitle')}</h1>
        <p className="sub">{t('fp.resetSub')}</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={doReset}>
          <div className="field">
            <label htmlFor="code">{t('fp.code')}</label>
            <input
              id="code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="newpw">{t('fp.newPassword')}</label>
            <input id="newpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {password.length > 0 && (
            <ul className="pw-rules">
              <li className={password.length >= 8 ? 'ok' : ''}>{t('pw.length')}</li>
              <li className={/[a-z]/.test(password) ? 'ok' : ''}>{t('pw.lower')}</li>
              <li className={/[A-Z]/.test(password) ? 'ok' : ''}>{t('pw.upper')}</li>
              <li className={/[0-9]/.test(password) ? 'ok' : ''}>{t('pw.number')}</li>
              <li className={/[^A-Za-z0-9]/.test(password) ? 'ok' : ''}>{t('pw.special')}</li>
            </ul>
          )}
          <button className="btn" disabled={busy || code.length < 6}>
            {busy ? t('btn.wait') : t('fp.changePassword')}
          </button>
        </form>
        <button className="link-toggle" type="button" onClick={() => setStep('email')}>
          {t('fp.resend')}
        </button>
      </div>
    );
  }

  return (
    <div className="fp-box">
      <h1>{t('fp.title')}</h1>
      <p className="sub">{t('fp.sub')}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={requestCode}>
        <div className="field">
          <label htmlFor="fpemail">{t('lbl.email')}</label>
          <input id="fpemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? t('btn.wait') : t('fp.sendCode')}</button>
      </form>
      <button className="link-toggle" type="button" onClick={onBack}>{t('fp.backToLogin')}</button>
    </div>
  );
}
