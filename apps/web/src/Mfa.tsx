import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api, setToken, setUser, getUser, setDeviceToken } from './lib/api';
import { useI18n } from './i18n';

// Fluxo de configuração do MFA (após login/cadastro de conta sem MFA).
export function MfaSetup({
  setupToken,
  onDone,
}: {
  setupToken: string;
  onDone: () => void;
}) {
  const { t, te } = useI18n();
  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .mfaSetupStart(setupToken)
      .then(async (r) => {
        setUri(r.uri);
        setSecret(r.secret);
        setQr(await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }));
      })
      .catch((err) => setError(te(err instanceof Error ? err.message : 'generic')));
  }, [setupToken]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.mfaSetupConfirm(setupToken, code);
      setToken(r.token);
      setUser(r.user);
      setRecovery(r.recoveryCodes); // mostra os códigos antes de entrar
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  // Etapa final: mostrar códigos de recuperação.
  if (recovery) {
    return (
      <div className="mfa-box">
        <h1>{t('mfa.recoveryTitle')}</h1>
        <p className="sub">{t('mfa.recoverySub')}</p>
        <ul className="mfa-recovery">
          {recovery.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          className="ghost sm"
          type="button"
          onClick={() => navigator.clipboard?.writeText(recovery.join('\n'))}
        >
          {t('mfa.copyCodes')}
        </button>
        <button className="btn" onClick={onDone}>
          {t('mfa.savedContinue')}
        </button>
      </div>
    );
  }

  return (
    <div className="mfa-box">
      <h1>{t('mfa.setupTitle')}</h1>
      <p className="sub">{t('mfa.setupSub')}</p>
      {error && <div className="error">{error}</div>}

      {qr ? (
        <>
          <div className="mfa-qr">
            <img src={qr} alt="QR Code MFA" />
          </div>
          <p className="mfa-secret-label">{t('mfa.cantScan')}</p>
          <code className="mfa-secret">{secret}</code>

          <form onSubmit={confirm}>
            <div className="field">
              <label htmlFor="mfacode">{t('mfa.enterCode')}</label>
              <input
                id="mfacode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
              />
            </div>
            <button className="btn" disabled={busy || code.length < 6}>
              {busy ? t('btn.wait') : t('mfa.activate')}
            </button>
          </form>
        </>
      ) : (
        !error && <p className="sub">{t('mfa.loading')}</p>
      )}
    </div>
  );
}

// Desafio de MFA no login (conta que já tem MFA ativo).
export function MfaChallenge({
  challengeToken,
  onDone,
}: {
  challengeToken: string;
  onDone: () => void;
}) {
  const { t, te } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [trust, setTrust] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.loginMfa(challengeToken, code, trust);
      setToken(r.token);
      setUser(r.user);
      if (r.deviceToken) setDeviceToken(r.deviceToken);
      onDone();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mfa-box">
      <h1>{t('mfa.challengeTitle')}</h1>
      <p className="sub">{useRecovery ? t('mfa.recoveryHint') : t('mfa.challengeSub')}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ch">{useRecovery ? t('mfa.recoveryCode') : t('mfa.enterCode')}</label>
          <input
            id="ch"
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(useRecovery ? e.target.value.trim().slice(0, 20) : e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder={useRecovery ? 'xxxxxxxxxx' : '000000'}
            required
          />
        </div>
        {!useRecovery && (
          <label className="mfa-trust">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            <span>{t('mfa.trustDevice')}</span>
          </label>
        )}
        <button className="btn" disabled={busy || code.length < 6}>
          {busy ? t('btn.wait') : t('mfa.verify')}
        </button>
      </form>
      <button
        className="link-toggle"
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v);
          setCode('');
          setError('');
        }}
      >
        {useRecovery ? t('mfa.useApp') : t('mfa.useRecovery')}
      </button>
    </div>
  );
}

// Pop-up opcional exibido após o login para usuários sem MFA.
// Permite ativar na hora ou adiar por 30 dias.
export function MfaEnablePrompt({ onClose }: { onClose: (activated: boolean) => void }) {
  const { t, te } = useI18n();
  const [stage, setStage] = useState<'ask' | 'setup' | 'done'>('ask');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      const r = await api.mfaEnableStart();
      setSecret(r.secret);
      setQr(await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }));
      setStage('setup');
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.mfaEnableConfirm(code.trim());
      const u = getUser() as Record<string, unknown> | null;
      if (u) setUser({ ...u, mfaEnabled: true });
      setRecovery(r.recoveryCodes);
      setStage('done');
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  function remindLater() {
    localStorage.setItem('vinculo_mfa_snooze', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    onClose(false);
  }

  return (
    <div className="admin-modal-overlay" onClick={() => stage !== 'setup' && !busy && onClose(false)}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        {stage === 'ask' && (
          <>
            <h2 className="admin-modal-title">🔒 {t('mfaPrompt.title')}</h2>
            <p className="admin-modal-warn" style={{ fontWeight: 400 }}>{t('mfaPrompt.body')}</p>
            {error && <div className="admin-modal-error">{error}</div>}
            <div className="admin-modal-actions" style={{ justifyContent: 'space-between' }}>
              <button className="ghost sm" onClick={remindLater} disabled={busy}>{t('mfaPrompt.remind')}</button>
              <button className="btn sm" onClick={startSetup} disabled={busy}>{busy ? t('btn.wait') : t('mfaPrompt.activate')}</button>
            </div>
          </>
        )}
        {stage === 'setup' && (
          <>
            <h2 className="admin-modal-title">{t('mfa.setupTitle')}</h2>
            <p className="admin-modal-warn" style={{ fontWeight: 400 }}>{t('mfa.setupSub')}</p>
            {error && <div className="admin-modal-error">{error}</div>}
            {qr && <div className="mfa-qr" style={{ textAlign: 'center' }}><img src={qr} alt="QR Code MFA" /></div>}
            <p className="mfa-secret-label">{t('mfa.cantScan')}</p>
            <code className="mfa-secret">{secret}</code>
            <form onSubmit={confirm}>
              <div className="field">
                <label htmlFor="mfaenablecode">{t('mfa.enterCode')}</label>
                <input id="mfaenablecode" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} placeholder="000000" />
              </div>
              <div className="admin-modal-actions">
                <button type="button" className="ghost sm" onClick={() => onClose(false)} disabled={busy}>{t('btn.cancel')}</button>
                <button className="btn sm" disabled={busy || code.trim().length < 6}>{busy ? t('btn.wait') : t('mfa.activate')}</button>
              </div>
            </form>
          </>
        )}
        {stage === 'done' && (
          <>
            <h2 className="admin-modal-title">{t('mfa.recoveryTitle')}</h2>
            <p className="admin-modal-warn" style={{ fontWeight: 400 }}>{t('mfa.recoverySub')}</p>
            <ul className="mfa-recovery">{recovery.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="admin-modal-actions">
              <button className="ghost sm" type="button" onClick={() => navigator.clipboard?.writeText(recovery.join('\n'))}>{t('mfa.copyCodes')}</button>
              <button className="btn sm" onClick={() => onClose(true)}>{t('mfa.savedContinue')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
