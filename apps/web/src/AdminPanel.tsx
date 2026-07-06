import { useEffect, useState } from 'react';
import { api, clearToken, type AdminClinic, type AdminUser } from './lib/api';
import { useI18n } from './i18n';
import { Brand } from './App';
import { Controls } from './Controls';

export default function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<{ clinics: number; users: number; patients: number } | null>(null);
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [selected, setSelected] = useState<AdminClinic | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.adminStats(), api.adminClinics()]);
      setStats(s);
      setClinics(c.clinics);
    } catch {
      setMsg(t('admin.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openClinic(clinic: AdminClinic) {
    setSelected(clinic);
    setUsers([]);
    try {
      const r = await api.adminClinicUsers(clinic.id);
      setUsers(r.users);
    } catch {
      setMsg(t('admin.loadError'));
    }
  }

  async function resetMfa(u: AdminUser) {
    if (!confirm(t('admin.confirmResetMfa').replace('{name}', u.name))) return;
    try {
      await api.adminResetMfa(u.id);
      setMsg(t('admin.mfaReset').replace('{name}', u.name));
      if (selected) openClinic(selected);
    } catch {
      setMsg(t('admin.actionError'));
    }
  }

  async function resetPassword(u: AdminUser) {
    if (!confirm(t('admin.confirmResetPw').replace('{name}', u.name))) return;
    try {
      const r = await api.adminResetPassword(u.id);
      setMsg(t('admin.pwReset').replace('{name}', u.name).replace('{pw}', r.tempPassword));
    } catch {
      setMsg(t('admin.actionError'));
    }
  }

  async function toggleClinic(clinic: AdminClinic) {
    const next = !clinic.isActive;
    const key = next ? 'admin.confirmActivate' : 'admin.confirmDeactivate';
    if (!confirm(t(key).replace('{name}', clinic.name))) return;
    try {
      await api.adminToggleClinic(clinic.id, next);
      load();
      if (selected?.id === clinic.id) setSelected({ ...clinic, isActive: next });
    } catch {
      setMsg(t('admin.actionError'));
    }
  }

  function logout() {
    clearToken();
    onLogout();
  }

  return (
    <div className="admin-shell">
      <div className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="admin-badge">{t('admin.badge')}</span>
          <Controls />
          <button className="ghost sm" onClick={logout}>{t('btn.logout')}</button>
        </div>
      </div>

      <div className="admin-body">
        <h1 className="admin-title">{t('admin.title')}</h1>

        {stats && (
          <div className="admin-stats">
            <div className="admin-stat"><b>{stats.clinics}</b><span>{t('admin.clinics')}</span></div>
            <div className="admin-stat"><b>{stats.users}</b><span>{t('admin.users')}</span></div>
            <div className="admin-stat"><b>{stats.patients}</b><span>{t('admin.patients')}</span></div>
          </div>
        )}

        {msg && <div className="admin-msg" onClick={() => setMsg('')}>{msg}</div>}
        {loading && <p className="admin-loading">{t('admin.loading')}</p>}

        <div className="admin-grid">
          <div className="admin-col">
            <h2 className="admin-h2">{t('admin.allClinics')}</h2>
            <div className="admin-list">
              {clinics.map((cl) => (
                <button
                  key={cl.id}
                  className={`admin-clinic ${selected?.id === cl.id ? 'active' : ''} ${cl.isActive ? '' : 'inactive'}`}
                  onClick={() => openClinic(cl)}
                >
                  <div className="admin-clinic-name">{cl.name}{!cl.isActive && <em> · {t('admin.disabled')}</em>}</div>
                  <div className="admin-clinic-meta">{cl.users} {t('admin.usersShort')} · {cl.patients} {t('admin.patientsShort')}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-col">
            {selected ? (
              <>
                <div className="admin-clinic-head">
                  <h2 className="admin-h2">{selected.name}</h2>
                  <button
                    className={selected.isActive ? 'btn-danger sm' : 'btn sm'}
                    onClick={() => toggleClinic(selected)}
                  >
                    {selected.isActive ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </div>
                <div className="admin-list">
                  {users.map((u) => (
                    <div key={u.id} className="admin-user">
                      <div className="admin-user-info">
                        <div className="admin-user-name">{u.name} <span className="admin-role">{u.role}</span></div>
                        <div className="admin-user-email">{u.email}</div>
                        <div className="admin-user-flags">
                          {u.mfaEnabled ? '🔒 MFA' : '⚠️ sem MFA'} · {u.isActive ? t('admin.active') : t('admin.disabled')}
                        </div>
                      </div>
                      <div className="admin-user-actions">
                        <button className="ghost sm" onClick={() => resetMfa(u)}>{t('admin.resetMfa')}</button>
                        <button className="ghost sm" onClick={() => resetPassword(u)}>{t('admin.resetPw')}</button>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && <p className="admin-loading">{t('admin.noUsers')}</p>}
                </div>
              </>
            ) : (
              <p className="admin-loading">{t('admin.selectClinic')}</p>
            )}
          </div>
        </div>

        <p className="admin-privacy">{t('admin.privacyNote')}</p>
      </div>
    </div>
  );
}
