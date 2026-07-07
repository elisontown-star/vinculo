import { useEffect, useState } from 'react';
import { api, type TeamMember } from './lib/api';
import { useI18n } from './i18n';

export default function TeamPanel({ onClose }: { onClose: () => void }) {
  const { t, te } = useI18n();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await api.teamList();
      setMembers(r.members);
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
      const r = await api.teamInvite({ name, email });
      setMsg(r.emailSent ? t('team.inviteSent').replace('{email}', email) : t('team.inviteNoEmail'));
      setName(''); setEmail(''); setShowInvite(false);
      load();
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box team-modal" onClick={(e) => e.stopPropagation()}>
        <div className="team-head">
          <h3>{t('team.title')}</h3>
          <button className="ghost sm" onClick={onClose}>×</button>
        </div>

        {msg && <div className="admin-msg" onClick={() => setMsg('')}>{msg}</div>}
        {error && <div className="error">{error}</div>}

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
                  <div className="team-member-name">{m.name} <span className="admin-role">{m.role}</span></div>
                  <div className="team-member-email">{m.email}</div>
                  <div className="team-member-flags">
                    {m.isActive ? (m.mfaEnabled ? '🔒 ' + t('team.activeMfa') : '✓ ' + t('team.active')) : '⏳ ' + t('team.pending')}
                  </div>
                </div>
                {m.role !== 'owner' && (
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
