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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(me?.role === 'owner' ? 'psychologist' : 'secretary');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await api.teamList();
      setMembers(r.members);
      if (r.clinic) setInfo({ companyCode: r.clinic.companyCode, plan: r.clinic.plan, limits: r.limits, usage: r.usage });
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
      </div>
    </div>
  );
}
