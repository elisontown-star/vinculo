import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api, setToken, setUser } from './lib/api';
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.loginMfa(challengeToken, code);
      setToken(r.token);
      setUser(r.user);
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
