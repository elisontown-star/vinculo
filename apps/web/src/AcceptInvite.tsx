import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { useI18n } from './i18n';

export function AcceptInvite({ token, onDone }: { token: string; onDone: () => void }) {
  const { t, te } = useI18n();
  const [info, setInfo] = useState<{ name: string; email: string } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.inviteInfo(token).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const strong =
      password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) &&
      /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
    if (!strong) { setError(t('pw.tooWeak')); return; }
    setBusy(true);
    try {
      await api.inviteAccept(token, password);
      setDone(true);
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <div className="fp-box">
        <h1>{t('invite.invalidTitle')}</h1>
        <p className="sub">{t('invite.invalidSub')}</p>
        <button className="btn" onClick={onDone}>{t('fp.backToLogin')}</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="fp-box">
        <h1>{t('invite.doneTitle')}</h1>
        <p className="sub">{t('invite.doneSub')}</p>
        <button className="btn" onClick={onDone}>{t('invite.goLogin')}</button>
      </div>
    );
  }

  return (
    <div className="fp-box">
      <h1>{t('invite.title')}</h1>
      {info && <p className="sub">{t('invite.sub').replace('{name}', info.name).replace('{email}', info.email)}</p>}
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ipw">{t('invite.createPassword')}</label>
          <input id="ipw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
        <button className="btn" disabled={busy || !info}>{busy ? t('btn.wait') : t('invite.activate')}</button>
      </form>
    </div>
  );
}
