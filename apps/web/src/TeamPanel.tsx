import { useEffect, useState } from 'react';
import { api, getUser, type TeamMember } from './lib/api';
import { useI18n } from './i18n';
import { roleLabel } from './roles';
import { IconLock, IconCheck, IconClock } from './icons';

export default function TeamPanel({ onClose }: { onClose: () => void }) {
  const { t, te } = useI18n();
  const me = getUser();
  const isOwner = me?.role === 'owner';
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [info, setInfo] = useState<{
    companyCode: string | null;
    plan: 'essencial' | 'pro' | 'plus';
    limits: { psychologist: number; secretary: number };
    usage: { psychologist: number; secretary: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showPlanReq, setShowPlanReq] = useState(false);
  const [reqPlan, setReqPlan] = useState<'essencial' | 'pro' | 'plus'>('pro');
  const [reqMsg, setReqMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(me?.role === 'owner' ? 'psychologist' : 'secretary');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const myId = (me as { id?: string } | null)?.id;
  const [granted, setGranted] = useState<{ id: string; granteeName: string | null; expiresAt: number | null }[]>([]);
  const [received, setReceived] = useState<{ id: string; grantorName: string | null; expiresAt: number | null }[]>([]);
  const [shareGrantee, setShareGrantee] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await api.teamList();
      setMembers(r.members);
      if (r.clinic) setInfo({ companyCode: r.clinic.companyCode, plan: r.clinic.plan, limits: r.limits, usage: r.usage });
      try { const s = await api.sharesList(); setGranted(s.granted); setReceived(s.received); } catch { /* ignora */ }
    } catch {
      setError(t('team.loadError'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.teamInvite({ name, email, role });
      setMsg(r.emailSent ? t('team.inviteSent').replace('{email}', email) : t('team.inviteNoEmail'));
      setName(''); setEmail(''); setRole('psychologist'); setShowInvite(false);
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'generic';
      const map: Record<string, string> = {
        plan_limit_reached: 'team.planLimit',
        forbidden_role: 'team.forbiddenRole',
      };
      setError(map[code] ? t(map[code]) : te(code));
    } finally {
      setBusy(false);
    }
  }

  async function requestPlan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.teamRequestPlan(reqPlan, reqMsg.trim() || undefined);
      setShowPlanReq(false);
      setReqMsg('');
      setMsg(t('team.planRequestSent'));
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  async function resend(m: TeamMember) {
    try {
      await api.teamResend(m.id);
      setMsg(t('team.inviteSent').replace('{email}', m.email));
    } catch {
      setError(t('team.actionError'));
    }
  }

  async function toggle(m: TeamMember) {
    try {
      await api.teamToggleActive(m.id, !m.isActive);
      load();
    } catch {
      setError(t('team.actionError'));
    }
  }

  async function grantShare() {
    if (!shareGrantee) return;
    const expiresAt = shareExpiry ? new Date(`${shareExpiry}T23:59:59`).getTime() : null;
    setBusy(true);
    setError('');
    try {
      await api.shareCreate(shareGrantee, expiresAt);
      setShareGrantee('');
      setShareExpiry('');
      setMsg(t('share.granted'));
      load();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }
  async function revokeShare(id: string) {
    try { await api.shareRevoke(id); load(); } catch { /* ignora */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box team-modal" onClick={(e) => e.stopPropagation()}>
        <div className="team-head">
          <h3>{t('team.title')}</h3>
          <button className="ghost sm" onClick={onClose}>×</button>
        </div>

        {msg && <div className="admin-msg" onClick={() => setMsg('')}>{msg}</div>}
        {error && <div className="error">{error}</div>}

        {info && (
          <div className="team-info">
            <div className="team-info-top">
              <div>
                <span className="team-info-label">{t('team.companyCode')}</span>
                <span className="team-info-code">{info.companyCode ?? '—'}</span>
              </div>
              <span className="team-plan-badge">{t('plan.' + info.plan)}</span>
            </div>
            <div className="team-seats">
              <span className={`seat ${info.usage.psychologist >= info.limits.psychologist ? 'full' : ''}`}>
                {t('team.rolePsychologist')} <b>{info.usage.psychologist}/{info.limits.psychologist}</b>
              </span>
              <span className={`seat ${info.usage.secretary >= info.limits.secretary ? 'full' : ''}`}>
                {t('team.roleSecretary')} <b>{info.usage.secretary}/{info.limits.secretary}</b>
              </span>
            </div>
            {isOwner && (
              <div className="team-plan-req">
                {!showPlanReq ? (
                  <button className="link-btn" onClick={() => setShowPlanReq(true)}>{t('team.requestPlan')}</button>
                ) : (
                  <form onSubmit={requestPlan} className="team-plan-req-form">
                    <label>{t('team.requestPlanTo')}</label>
                    <select value={reqPlan} onChange={(e) => setReqPlan(e.target.value as 'essencial' | 'pro' | 'plus')}>
                      <option value="essencial">{t('plan.essencial')}</option>
                      <option value="pro">{t('plan.pro')}</option>
                      <option value="plus">{t('plan.plus')}</option>
                    </select>
                    <textarea value={reqMsg} onChange={(e) => setReqMsg(e.target.value)} placeholder={t('team.requestPlanMsg')} rows={2} />
                    <div className="team-invite-actions">
                      <button type="button" className="ghost sm" onClick={() => setShowPlanReq(false)}>{t('btn.cancel')}</button>
                      <button className="btn sm" disabled={busy}>{busy ? t('btn.wait') : t('team.requestPlanSend')}</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {!showInvite && (
          <button className="btn sm" onClick={() => setShowInvite(true)}>+ {t('team.invite')}</button>
        )}

        {showInvite && (
          <form onSubmit={invite} className="team-invite-form">
            <div className="field">
              <label>{t('team.name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('lbl.email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('team.role')}</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {isOwner && <option value="psychologist">{t('team.rolePsychologist')}</option>}
                <option value="secretary">{t('team.roleSecretary')}</option>
              </select>
            </div>
            <div className="team-invite-actions">
              <button type="button" className="ghost sm" onClick={() => setShowInvite(false)}>{t('btn.cancel')}</button>
              <button className="btn sm" disabled={busy}>{busy ? t('btn.wait') : t('team.sendInvite')}</button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="admin-loading">{t('team.loading')}</p>
        ) : (
          <div className="team-list">
            {members.map((m) => (
              <div key={m.id} className="team-member">
                <div>
                  <div className="team-member-name">{m.name} <span className="admin-role">{roleLabel(t, m.role)}</span></div>
                  <div className="team-member-email">{m.email}</div>
                  <div className="team-member-flags">
                    {m.isActive ? (
                      m.mfaEnabled
                        ? <span className="flag ok"><IconLock size={13} /> {t('team.activeMfa')}</span>
                        : <span className="flag ok"><IconCheck size={13} /> {t('team.active')}</span>
                    ) : (
                      <span className="flag warn"><IconClock size={13} /> {t('team.pending')}</span>
                    )}
                  </div>
                </div>
                {isOwner && m.role !== 'owner' && (
                  <div className="team-member-actions">
                    {!m.isActive && <button className="ghost sm" onClick={() => resend(m)}>{t('team.resend')}</button>}
                    <button className="ghost sm" onClick={() => toggle(m)}>
                      {m.isActive ? t('team.deactivate') : t('team.activate')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {(isOwner || me?.role === 'psychologist') && (
          <div className="team-share">
            <h3 className="team-share-title">{t('share.title')}</h3>
            <p className="team-share-sub">{t('share.sub')}</p>
            <div className="team-share-form">
              <select value={shareGrantee} onChange={(e) => setShareGrantee(e.target.value)}>
                <option value="">{t('share.pickColleague')}</option>
                {members.filter((m) => (m.role === 'psychologist' || m.role === 'owner') && m.id !== myId).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <input type="date" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)} title={t('share.until')} />
              <button className="btn sm" onClick={grantShare} disabled={busy || !shareGrantee}>{t('share.grant')}</button>
            </div>
            {granted.length > 0 && (
              <ul className="team-share-list">
                {granted.map((g) => (
                  <li key={g.id}>
                    <span>{g.granteeName}{g.expiresAt ? ` · ${t('share.until')} ${new Date(g.expiresAt).toLocaleDateString('pt-BR')}` : ` · ${t('share.noExpiry')}`}</span>
                    <button className="link-btn" onClick={() => revokeShare(g.id)}>{t('share.revoke')}</button>
                  </li>
                ))}
              </ul>
            )}
            {received.length > 0 && (
              <div className="team-share-received">{t('share.receivedFrom')}: {received.map((r) => r.grantorName).filter(Boolean).join(', ')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
