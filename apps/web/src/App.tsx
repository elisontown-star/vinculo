import { useState, useRef, useEffect } from 'react';
import { api, setToken, clearToken, setUser, getUser } from './lib/api';
import { useI18n } from './i18n';
import { Controls } from './Controls';
import { MfaSetup, MfaChallenge, MfaEnablePrompt } from './Mfa';
import { ForgotPassword } from './ForgotPassword';
import { AcceptInvite } from './AcceptInvite';
import Workspace from './Workspace';
import AdminPanel from './AdminPanel';

const VTECH_LOGO =
  'https://vtechit.com.br/wp-content/uploads/2026/05/cropped-Blue-and-Orange-Modern-Letter-V-Technology-Logo.png';

export function Brand({ hideLogo = false }: { hideLogo?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`brand ${hideLogo ? 'brand-nologo' : ''}`}>
      {!hideLogo && (
        <img
          className="brand-logo"
          src={VTECH_LOGO}
          alt="Vtech IT"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="brand-text">
        <span className="word"><span className="word-v">V</span>ínculo</span>
        <span className="tag">{t('brand.tag')}</span>
      </div>
    </div>
  );
}

function maskTaxId(type: 'cnpj' | 'cpf', v: string): string {
  const d = v.replace(/\D/g, '');
  if (type === 'cpf') {
    const s = d.slice(0, 11);
    if (s.length > 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
    if (s.length > 6) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
    if (s.length > 3) return `${s.slice(0, 3)}.${s.slice(3)}`;
    return s;
  }
  const s = d.slice(0, 14);
  if (s.length > 12) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  if (s.length > 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8)}`;
  if (s.length > 5) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`;
  if (s.length > 2) return `${s.slice(0, 2)}.${s.slice(2)}`;
  return s;
}


function TermsModal({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      className="terms-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="terms-modal">
        <div className="terms-modal-header">
          <span className="terms-modal-title">Termos de Uso — Vínculo Clínico</span>
          <button className="terms-close-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="terms-body">
          <p className="terms-updated">Última atualização: julho de 2026 · Versão 1.0</p>

          <div className="terms-callout">
            Ao criar uma conta ou utilizar o Vínculo Clínico, você concorda integralmente com estes Termos. Caso não concorde, não utilize o serviço.
          </div>

          <h2>1. Aceitação dos Termos</h2>
          <p>Estes Termos de Uso regulam o acesso e o uso da plataforma <strong>Vínculo Clínico</strong>, operada pela <strong>VTech IT Solutions</strong>. Ao criar uma conta ou utilizar qualquer funcionalidade da plataforma, o usuário declara ter lido, compreendido e concordado com todos os termos aqui dispostos, bem como com nossa Política de Privacidade.</p>

          <h2>2. Descrição do Serviço</h2>
          <p>O Vínculo Clínico é uma plataforma de gestão clínica inteligente voltada a psicólogos e clínicas de saúde mental. Os recursos incluem registro de sessões e prontuários, geração de resumos com inteligência artificial, agenda, gestão de equipes e comunicação com a assistente Ana Luiza.</p>
          <div className="terms-callout terms-callout-warn">
            O Vínculo Clínico é uma ferramenta de apoio e <strong>não substitui</strong> o julgamento técnico do profissional de saúde. As sugestões geradas por IA são orientativas e não constituem diagnóstico ou prescrição.
          </div>

          <h2>3. Cadastro e Conta</h2>
          <p>Para utilizar o serviço, o usuário deverá criar uma conta com informações verdadeiras e atualizadas. É vedado compartilhar credenciais, criar contas com dados de terceiros ou criar múltiplas contas para evasão de limites. O usuário é responsável por todas as atividades realizadas em sua conta.</p>

          <h2>4. Planos, Pagamento e Cancelamento</h2>
          <p><strong>Período de teste:</strong> 7 dias gratuitos, sem cartão de crédito. Após esse período, a continuidade está condicionada à contratação de um plano pago.</p>
          <p><strong>Cancelamento:</strong> pode ser feito a qualquer momento pelo painel da conta, com efeito ao final do período já pago.</p>
          <p><strong>Direito de arrependimento:</strong> nos termos do Art. 49 do CDC, o usuário pessoa física pode solicitar cancelamento e reembolso integral em até 7 dias corridos da contratação.</p>

          <h2>5. Uso Aceitável</h2>
          <p>O usuário compromete-se a utilizar a plataforma exclusivamente para fins lícitos e em conformidade com as normas do Conselho Federal de Psicologia (CFP). É proibido inserir dados de pacientes sem consentimento adequado, utilizar a IA para gerar documentos clínicos que requeiram assinatura de profissional habilitado, ou tentar comprometer a segurança do serviço.</p>

          <h2>6. Dados de Saúde e LGPD</h2>
          <p>O Vínculo Clínico processa <strong>dados pessoais sensíveis</strong> (informações de saúde), conforme a Lei nº 13.709/2018 (LGPD). O usuário (psicólogo ou clínica) atua como <strong>Controlador</strong> dos dados de seus pacientes e é responsável por obter os consentimentos necessários. A VTech IT Solutions atua como <strong>Operadora</strong>, processando os dados exclusivamente para prestação do serviço.</p>
          <p>Os dados dos pacientes <strong>não serão vendidos, compartilhados ou utilizados para fins publicitários</strong>.</p>

          <h2>7. Propriedade Intelectual</h2>
          <p>Todo o conteúdo da plataforma — incluindo marca, software, layout e a assistente Ana Luiza — é de propriedade exclusiva da VTech IT Solutions. O usuário mantém a titularidade sobre seus dados clínicos e pode exportá-los a qualquer momento. Após encerramento da conta, os dados ficam disponíveis para exportação por até 30 dias.</p>

          <h2>8. Disponibilidade e Suporte</h2>
          <p>A VTech empreenderá esforços para manter o serviço disponível 99% do tempo. O suporte é prestado por e-mail em <strong>suporte@vtechit.com.br</strong> e WhatsApp <strong>(11) 92034-8899</strong>, de segunda a sexta, das 9h às 18h (horário de Brasília).</p>

          <h2>9. Limitação de Responsabilidade</h2>
          <p>A VTech não se responsabiliza por danos decorrentes de decisões clínicas tomadas com base nas sugestões da IA, interrupções temporárias do serviço por falhas de terceiros, ou perda de dados por ação do próprio usuário. Em qualquer hipótese, a responsabilidade máxima da VTech fica limitada ao valor pago nos últimos 3 meses de assinatura.</p>

          <h2>10. Alterações nos Termos</h2>
          <p>A VTech poderá alterar estes Termos a qualquer momento. Alterações relevantes serão comunicadas com pelo menos 15 dias de antecedência por e-mail ou notificação na plataforma.</p>

          <h2>11. Rescisão</h2>
          <p>O usuário pode encerrar sua conta a qualquer momento. A VTech poderá suspender ou encerrar o acesso em caso de violação destes Termos, inadimplência persistente, risco à segurança da plataforma ou determinação legal.</p>

          <h2>12. Disposições Gerais</h2>
          <p>Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da Comarca de <strong>São Paulo/SP</strong>. Dúvidas: <strong>juridico@vtechit.com.br</strong></p>
        </div>
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
  const [plan, setPlan] = useState<'essencial' | 'pro' | 'plus'>('essencial');
  const [taxIdType, setTaxIdType] = useState<'cnpj' | 'cpf'>('cnpj');
  const [taxId, setTaxId] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState<null | { kind: 'setup' | 'challenge'; token: string }>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const resetParams = (() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('reset') === '1') {
      return { email: p.get('email') ?? '', code: p.get('code') ?? '' };
    }
    return null;
  })();
  const [showForgot, setShowForgot] = useState(!!resetParams);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && !termsAccepted) {
      setError('Você precisa aceitar os Termos de Uso para continuar.');
      return;
    }
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
      const taxDigits = taxId.replace(/\D/g, '');
      if (taxDigits.length !== (taxIdType === 'cpf' ? 11 : 14)) {
        setError(t('err.invalid_tax_id'));
        return;
      }
    }
    setBusy(true);
    try {
      const res: any =
        mode === 'register'
          ? await api.register({ clinicName, name, email, password, plan, taxIdType, taxId: taxId.replace(/\D/g, '') })
          : await api.login({ email, password });

      if (res.mfaSetupRequired) {
        setMfaStep({ kind: 'setup', token: res.setupToken });
        return;
      }
      if (res.mfaRequired) {
        setMfaStep({ kind: 'challenge', token: res.challengeToken });
        return;
      }
      // (fluxo antigo, sem MFA — fallback)
      setToken(res.token);
      setUser(res.user);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'generic';
      if (msg === 'clinic_blocked') {
        setBlocked(true);
      } else {
        setError(te(msg));
      }
    } finally {
      setBusy(false);
    }
  }

  const inviteToken = (() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('invite');
  })();
  const [showInvite, setShowInvite] = useState(!!inviteToken);

  if (showInvite && inviteToken) {
    return (
      <div className="mfa-wrap">
        <div className="mfa-topbar"><Brand /><Controls /></div>
        <div className="mfa-center">
          <div className="auth-card">
            <AcceptInvite token={inviteToken} onDone={() => { setShowInvite(false); window.history.replaceState({}, '', '/'); }} />
          </div>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="mfa-wrap">
        <div className="mfa-topbar"><Brand /><Controls /></div>
        <div className="mfa-center">
          <div className="auth-card">
            <div className="fp-box">
              <div className="blocked-icon">🔒</div>
              <h1>{t('blocked.title')}</h1>
              <p className="sub">{t('blocked.sub')}</p>
              <a className="btn" href="mailto:suporte@vtechit.com.br?subject=Ativação%20de%20plano%20-%20Vínculo">
                {t('blocked.contact')}
              </a>
              <p className="blocked-email">suporte@vtechit.com.br</p>
              <button className="link-toggle" type="button" onClick={() => { setBlocked(false); setEmail(''); setPassword(''); }}>
                {t('fp.backToLogin')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showForgot) {
    return (
      <div className="mfa-wrap">
        <div className="mfa-topbar">
          <Brand />
          <Controls />
        </div>
        <div className="mfa-center">
          <div className="auth-card">
            <ForgotPassword
              onBack={() => {
                setShowForgot(false);
                window.history.replaceState({}, '', '/');
              }}
              initialEmail={resetParams?.email}
              initialCode={resetParams?.code}
            />
          </div>
        </div>
      </div>
    );
  }

  if (mfaStep?.kind === 'setup') {
    return (
      <div className="mfa-wrap">
        <div className="mfa-topbar">
          <Brand />
          <Controls />
        </div>
        <div className="mfa-center">
          <div className="auth-card">
            <MfaSetup setupToken={mfaStep.token} onDone={onDone} />
          </div>
        </div>
      </div>
    );
  }
  if (mfaStep?.kind === 'challenge') {
    return (
      <div className="mfa-wrap">
        <div className="mfa-topbar">
          <Brand />
          <Controls />
        </div>
        <div className="mfa-center">
          <div className="auth-card">
            <MfaChallenge challengeToken={mfaStep.token} onDone={onDone} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-controls">
        <Controls />
      </div>

      <div className="auth-hero">
        <Brand hideLogo />
        <h2 className="hero-title">{t('hero.title')}</h2>
        <p className="hero-sub">{t('hero.sub')}</p>
        <ul className="hero-points">
          <li>{t('hero.p1')}</li>
          <li>{t('hero.p2')}</li>
          <li>{t('hero.p3')}</li>
        </ul>
        <a
          className="hero-foot-badge"
          href="https://vtechit.com.br"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={VTECH_LOGO} alt="VTECH IT" className="hero-foot-logo" />
          <span className="hero-foot-text">{t('hero.foot')}</span>
        </a>
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
                  <label htmlFor="taxid">{t('lbl.taxId')}</label>
                  <div className="seg">
                    <button type="button" className={taxIdType === 'cnpj' ? 'on' : ''} onClick={() => { setTaxIdType('cnpj'); setTaxId(''); }}>{t('taxId.cnpj')}</button>
                    <button type="button" className={taxIdType === 'cpf' ? 'on' : ''} onClick={() => { setTaxIdType('cpf'); setTaxId(''); }}>{t('taxId.cpf')}</button>
                  </div>
                  <input
                    id="taxid"
                    inputMode="numeric"
                    value={taxId}
                    onChange={(e) => setTaxId(maskTaxId(taxIdType, e.target.value))}
                    placeholder={taxIdType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                    required
                  />
                </div>
                <div className="field">
                  <label>{t('lbl.plan')}</label>
                  <div className="plan-picker">
                    {(['essencial', 'pro', 'plus'] as const).map((p) => (
                      <button type="button" key={p} className={`plan-card ${plan === p ? 'on' : ''}`} onClick={() => setPlan(p)}>
                        <span className="plan-name">{t('plan.' + p)}</span>
                        <span className="plan-seats">{t('plan.' + p + '.seats')}</span>
                      </button>
                    ))}
                  </div>
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
            {mode === 'register' && (
              <div className="trial-notice">🎁 {t('auth.trialNotice')}</div>
            )}
            {mode === 'register' && (
              <label className="terms-check-label">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="terms-check-input"
                />
                <span>
                  Li e aceito os{' '}
                  <button type="button" className="terms-inline-link" onClick={() => setShowTerms(true)}>
                    Termos de Uso
                  </button>
                  {' '}e a{' '}
                  <button type="button" className="terms-inline-link" onClick={() => setShowTerms(true)}>
                    Política de Privacidade
                  </button>
                </span>
              </label>
            )}
            <button className="btn" disabled={busy || (mode === 'register' && !termsAccepted)}>
              {busy ? t('btn.wait') : mode === 'register' ? t('btn.createClinic') : t('btn.enter')}
            </button>
          </form>

          {mode === 'login' && (
            <button className="link-forgot" type="button" onClick={() => setShowForgot(true)}>
              {t('fp.link')}
            </button>
          )}

          <div className="terms-footer-link">
            <button type="button" className="terms-inline-link" onClick={() => setShowTerms(true)}>Termos de Uso</button>
            {' · '}
            <button type="button" className="terms-inline-link" onClick={() => setShowTerms(true)}>Privacidade</button>
          </div>

          {mode === 'login' ? (
            <div className="cta-free-wrap">
              <div className="cta-divider"><span>{t('cta.new')}</span></div>
              <button type="button" className="cta-free" onClick={() => setMode('register')}>
                {t('cta.freeSignup')} →
              </button>
              <div className="cta-free-note">{t('cta.badge')} · {t('cta.freeSub')}</div>
            </div>
          ) : (
            <div className="switch">
              {t('sw.hasAccount')} <button onClick={() => setMode('login')}>{t('sw.enter')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
    {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!localStorage.getItem('vinculo_token'));
  const [adminView, setAdminView] = useState<'admin' | 'clinic'>('admin');
  const [mfaPrompt, setMfaPrompt] = useState(false);

  // Mostra o pop-up de MFA APENAS no primeiro acesso (logo após o login).
  // Nunca em refresh/reabertura com a sessão já aberta.
  function afterLogin() {
    setAuthed(true);
    const u = getUser() as { mfaEnabled?: boolean } | null;
    const snooze = Number(localStorage.getItem('vinculo_mfa_snooze') || 0);
    if (u && !u.mfaEnabled && Date.now() > snooze) setMfaPrompt(true);
  }

  function logout() {
    clearToken();
    localStorage.removeItem('vinculo_user');
    setAuthed(false);
    setAdminView('admin');
  }

  if (!authed) return <Auth onDone={afterLogin} />;

  const user = getUser();
  let content;
  if (user?.role === 'platform_admin') {
    content =
      adminView === 'clinic' ? (
        <Workspace onLogout={logout} onBackToAdmin={() => setAdminView('admin')} />
      ) : (
        <AdminPanel onLogout={logout} onViewClinic={() => setAdminView('clinic')} />
      );
  } else {
    content = <Workspace onLogout={logout} />;
  }

  return (
    <>
      {content}
      {mfaPrompt && <MfaEnablePrompt onClose={() => setMfaPrompt(false)} />}
    </>
  );
}
