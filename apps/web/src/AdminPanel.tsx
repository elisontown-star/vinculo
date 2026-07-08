import { useEffect, useState } from 'react';
import { api, clearToken, type AdminClinic, type AdminUser } from './lib/api';
import { useI18n } from './i18n';
import { Brand } from './App';
import { Controls } from './Controls';
import { IconLock, IconWarning, IconClock, IconCheckCircle, IconBlock } from './icons';
import { roleLabel } from './roles';

export default function AdminPanel({ onLogout, onViewClinic }: { onLogout: () => void; onViewClinic?: () => void }) {
  const { t } = useI18n();
  const [view, setView] = useState<'clinics' | 'search'>('clinics');
  const [stats, setStats] = useState<{ clinics: number; users: number; patients: number } | null>(null);
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [selected, setSelected] = useState<AdminClinic | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Busca global
  const [q, setQ] = useState('');
  const [searchUsers, setSearchUsers] = useState<(AdminUser & { clinicName?: string; clinicId?: string })[]>([]);
  const [searchClinics, setSearchClinics] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [searching, setSearching] = useState(false);

  // Modal de apagar clínica (destrutivo)
  const [deleting, setDeleting] = useState<AdminClinic | null>(null);
  const [delName, setDelName] = useState('');
  const [delCode, setDelCode] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

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

  // Vindo da busca: garante que a clínica está carregada, troca para a aba Clínicas e abre.
  async function openClinicFromSearch(clinicId: string) {
    let clinic = clinics.find((c) => c.id === clinicId) ?? null;
    if (!clinic) {
      // Recarrega a lista caso a clínica não esteja em memória.
      try {
        const c = await api.adminClinics();
        setClinics(c.clinics);
        clinic = c.clinics.find((x) => x.id === clinicId) ?? null;
      } catch {
        setMsg(t('admin.loadError'));
        return;
      }
    }
    if (clinic) {
      setView('clinics');
      openClinic(clinic);
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
      setMsg(t('admin.pwEmailSent').replace('{email}', r.email));
    } catch {
      setMsg(t('admin.actionError'));
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await api.adminSearch(q.trim());
      setSearchUsers(r.users);
      setSearchClinics(r.clinics);
    } catch {
      setMsg(t('admin.actionError'));
    } finally {
      setSearching(false);
    }
  }

  async function activatePlan(clinic: AdminClinic) {
    if (!confirm(t('admin.confirmActivatePlan').replace('{name}', clinic.name))) return;
    try {
      await api.adminActivatePlan(clinic.id);
      setMsg(t('admin.planActivated').replace('{name}', clinic.name));
      load();
      setSelected({ ...clinic, status: 'active', isActive: true });
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

  function openDelete(clinic: AdminClinic) {
    setDeleting(clinic);
    setDelName('');
    setDelCode('');
    setDelErr('');
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDelBusy(true);
    setDelErr('');
    try {
      await api.adminDeleteClinic(deleting.id, delName.trim(), delCode.trim());
      const name = deleting.name;
      setDeleting(null);
      if (selected?.id === deleting.id) {
        setSelected(null);
        setUsers([]);
      }
      setMsg(t('admin.clinicDeleted').replace('{name}', name));
      load();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'generic';
      const map: Record<string, string> = {
        name_mismatch: 'admin.delErrName',
        invalid_mfa: 'admin.delErrMfa',
        admin_mfa_required: 'admin.delErrAdminMfa',
        clinic_has_admin: 'admin.delErrHasAdmin',
      };
      setDelErr(t(map[code] ?? 'admin.actionError'));
    } finally {
      setDelBusy(false);
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
          {onViewClinic && (
            <button className="ghost sm" onClick={onViewClinic}>{t('admin.viewClinic')}</button>
          )}
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

        <div className="admin-tabs">
          <button className={view === 'clinics' ? 'on' : ''} onClick={() => setView('clinics')}>{t('admin.tabClinics')}</button>
          <button className={view === 'search' ? 'on' : ''} onClick={() => setView('search')}>{t('admin.tabSearch')}</button>
        </div>

        {view === 'search' && (
          <div className="admin-search">
            <form onSubmit={runSearch} className="admin-search-bar">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('admin.searchPlaceholder')}
                autoFocus
              />
              <button className="btn sm" disabled={searching || q.trim().length < 2}>
                {searching ? t('admin.loading') : t('admin.searchBtn')}
              </button>
            </form>

            {searchClinics.length > 0 && (
              <>
                <h2 className="admin-h2">{t('admin.clinics')}</h2>
                <div className="admin-list">
                  {searchClinics.map((cl) => (
                    <button
                      key={cl.id}
                      className={`admin-clinic ${cl.isActive ? '' : 'inactive'}`}
                      onClick={() => openClinicFromSearch(cl.id)}
                    >
                      <div className="admin-clinic-name">{cl.name}{!cl.isActive && <em> · {t('admin.disabled')}</em>}</div>
                      <div className="admin-clinic-meta">{t('admin.openClinic')}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {searchUsers.length > 0 && (
              <>
                <h2 className="admin-h2" style={{ marginTop: 18 }}>{t('admin.users')}</h2>
                <div className="admin-list">
                  {searchUsers.map((u) => (
                    <div key={u.id} className="admin-user">
                      <div className="admin-user-info">
                        <div className="admin-user-name">{u.name} <span className="admin-role">{roleLabel(t, u.role)}</span></div>
                        <div className="admin-user-email">{u.email} · <button className="admin-link" onClick={() => u.clinicId && openClinicFromSearch(u.clinicId)}>{u.clinicName}</button></div>
                        <div className="admin-user-flags">{u.mfaEnabled ? <span className="flag ok"><IconLock size={13} /> MFA</span> : <span className="flag warn"><IconWarning size={13} /> sem MFA</span>}</div>
                      </div>
                      <div className="admin-user-actions">
                        <button className="ghost sm" onClick={() => resetMfa(u)}>{t('admin.resetMfa')}</button>
                        <button className="ghost sm" onClick={() => resetPassword(u)}>{t('admin.resetPw')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {q.trim().length >= 2 && !searching && searchUsers.length === 0 && searchClinics.length === 0 && (
              <p className="admin-loading">{t('admin.noResults')}</p>
            )}
          </div>
        )}

        {view === 'clinics' && (
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
                  <div className="admin-clinic-meta">
                    {cl.users} {t('admin.usersShort')} · {cl.patients} {t('admin.patientsShort')}
                    {cl.status === 'trial' && <span className="admin-tag trial"><IconClock size={13} /> trial</span>}
                    {cl.status === 'active' && <span className="admin-tag active"><IconCheckCircle size={13} /> plano ativo</span>}
                    {cl.status === 'blocked' && <span className="admin-tag blocked"><IconBlock size={13} /> bloqueada</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-col">
            {selected ? (
              <>
                <div className="admin-clinic-head">
                  <h2 className="admin-h2">{selected.name}</h2>
                  <div className="admin-clinic-head-actions">
                    {selected.status !== 'active' && (
                      <button className="btn sm" onClick={() => activatePlan(selected)}>{t('admin.activatePlan')}</button>
                    )}
                    <button
                      className={selected.isActive ? 'btn-danger sm' : 'btn sm'}
                      onClick={() => toggleClinic(selected)}
                    >
                      {selected.isActive ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                    <button className="btn-danger-outline sm" onClick={() => openDelete(selected)}>
                      {t('admin.deleteClinic')}
                    </button>
                  </div>
                </div>
                {selected.status && (
                  <div className={`admin-plan-status ${selected.status}`}>
                    {selected.status === 'trial' && <><IconClock size={16} /> {t('admin.statusTrial').replace('{date}', selected.trialEndsAt ? new Date(selected.trialEndsAt).toLocaleDateString('pt-BR') : '—')}</>}
                    {selected.status === 'active' && <><IconCheckCircle size={16} /> {t('admin.statusActive')}</>}
                    {selected.status === 'blocked' && <><IconBlock size={16} /> {t('admin.statusBlocked')}</>}
                  </div>
                )}
                <div className="admin-list">
                  {users.map((u) => (
                    <div key={u.id} className="admin-user">
                      <div className="admin-user-info">
                        <div className="admin-user-name">{u.name} <span className="admin-role">{roleLabel(t, u.role)}</span></div>
                        <div className="admin-user-email">{u.email}</div>
                        <div className="admin-user-flags">
                          {u.mfaEnabled ? <span className="flag ok"><IconLock size={13} /> MFA</span> : <span className="flag warn"><IconWarning size={13} /> sem MFA</span>} · {u.isActive ? t('admin.active') : t('admin.disabled')}
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
        )}

        <p className="admin-privacy">{t('admin.privacyNote')}</p>
      </div>

      {deleting && (
        <div className="admin-modal-overlay" onClick={() => !delBusy && setDeleting(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title danger"><IconWarning size={20} /> {t('admin.deleteClinic')}</h2>
            <p className="admin-modal-warn">
              {t('admin.deleteWarn').replace('{name}', deleting.name)}
            </p>
            <ul className="admin-modal-list">
              <li>{deleting.users} {t('admin.usersShort')}</li>
              <li>{deleting.patients} {t('admin.patientsShort')} {t('admin.deleteWithData')}</li>
            </ul>
            <p className="admin-modal-irrev">{t('admin.deleteIrreversible')}</p>

            <label className="admin-modal-label">
              {t('admin.deleteTypeName').replace('{name}', deleting.name)}
            </label>
            <input
              className="admin-modal-input"
              value={delName}
              onChange={(e) => setDelName(e.target.value)}
              placeholder={deleting.name}
              autoFocus
            />

            <label className="admin-modal-label">{t('admin.deleteMfaLabel')}</label>
            <input
              className="admin-modal-input"
              value={delCode}
              onChange={(e) => setDelCode(e.target.value.replace(/\s/g, ''))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            {delErr && <div className="admin-modal-error">{delErr}</div>}

            <div className="admin-modal-actions">
              <button className="ghost sm" onClick={() => setDeleting(null)} disabled={delBusy}>
                {t('btn.cancel')}
              </button>
              <button
                className="btn-danger sm"
                onClick={confirmDelete}
                disabled={delBusy || delName.trim() !== deleting.name.trim() || delCode.trim().length < 6}
              >
                {delBusy ? t('admin.loading') : t('admin.deleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
