import { useState } from 'react';
import { api, type Patient } from '../lib/api';
import { fileToAvatarDataURL } from '../lib/photo';
import { useI18n } from '../i18n';
import { ESTADOS, PROFISSOES, RELIGIOES } from '../locales';

function getPath(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: any, path: string, value: any) {
  const keys = path.split('.');
  const clone = structuredClone(obj);
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

type Field = {
  p: string;
  k: string;
  type?: 'text' | 'area' | 'check' | 'date' | 'select' | 'datalist';
  opt?: string; // conjunto traduzido (O)
  options?: string[]; // lista fixa (datalist / estados)
  noEmpty?: boolean;
  wide?: boolean;
};
type Section = { titleKey: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    titleKey: 'sec.personal',
    fields: [
      { p: 'fullName', k: 'f.fullName' },
      { p: 'socialName', k: 'f.socialName' },
      { p: 'profile.personal.sex', k: 'f.sex', type: 'select', opt: 'sexo' },
      { p: 'profile.personal.gender', k: 'f.gender', type: 'select', opt: 'genero' },
      { p: 'cpf', k: 'f.cpf' },
      { p: 'profile.personal.rg', k: 'f.rg' },
      { p: 'profile.personal.maritalStatus', k: 'f.marital', type: 'select', opt: 'estadoCivil' },
      { p: 'birthDate', k: 'f.birth', type: 'date' },
      { p: 'phone', k: 'f.phone' },
      { p: 'whatsapp', k: 'f.whatsapp' },
      { p: 'email', k: 'f.email' },
      { p: 'profile.personal.profession', k: 'f.profession', type: 'datalist', options: PROFISSOES },
      { p: 'profile.personal.company', k: 'f.company' },
      { p: 'profile.personal.education', k: 'f.education', type: 'select', opt: 'escolaridade' },
      { p: 'profile.personal.address', k: 'f.address', wide: true },
      { p: 'profile.personal.city', k: 'f.city' },
      { p: 'profile.personal.state', k: 'f.state', type: 'select', options: ESTADOS },
      { p: 'profile.personal.zip', k: 'f.zip' },
      { p: 'status', k: 'f.status', type: 'select', opt: 'status', noEmpty: true },
    ],
  },
  {
    titleKey: 'sec.clinical',
    fields: [
      { p: 'profile.clinical.complaint', k: 'f.complaint', type: 'area', wide: true },
      { p: 'profile.clinical.history', k: 'f.history', type: 'area', wide: true },
      { p: 'profile.clinical.goals', k: 'f.goals', type: 'area', wide: true },
      { p: 'profile.clinical.suffering', k: 'f.suffering', type: 'select', opt: 'sofrimento' },
      { p: 'profile.clinical.psychiatric', k: 'f.psychiatric', type: 'select', opt: 'psiquiatrico' },
      { p: 'profile.clinical.priorDiagnoses', k: 'f.priorDx', type: 'area', wide: true },
      { p: 'profile.clinical.priorTreatments', k: 'f.priorTx', type: 'area', wide: true },
      { p: 'profile.clinical.referrals', k: 'f.referrals', type: 'area', wide: true },
    ],
  },
  {
    titleKey: 'sec.financial',
    fields: [
      { p: 'profile.financial.ownHome', k: 'f.ownHome', type: 'check' },
      { p: 'profile.financial.rent', k: 'f.rent', type: 'check' },
      { p: 'profile.financial.withFamily', k: 'f.withFamily', type: 'check' },
      { p: 'profile.financial.car', k: 'f.car', type: 'check' },
      { p: 'profile.financial.motorcycle', k: 'f.motorcycle', type: 'check' },
      { p: 'profile.financial.situation', k: 'f.sitFin', type: 'select', opt: 'sitFin' },
      { p: 'profile.financial.debt', k: 'f.debt', type: 'select', opt: 'endividamento' },
      { p: 'profile.financial.work', k: 'f.work', type: 'select', opt: 'trabalho' },
      { p: 'profile.financial.income', k: 'f.income', type: 'select', opt: 'renda' },
    ],
  },
  {
    titleKey: 'sec.health',
    fields: [
      { p: 'profile.health.depression', k: 'f.depression', type: 'check' },
      { p: 'profile.health.anxiety', k: 'f.anxiety', type: 'check' },
      { p: 'profile.health.tag', k: 'f.tag', type: 'check' },
      { p: 'profile.health.tdah', k: 'f.tdah', type: 'check' },
      { p: 'profile.health.bipolar', k: 'f.bipolar', type: 'check' },
      { p: 'profile.health.medications', k: 'f.medications', type: 'area', wide: true },
      { p: 'profile.health.diseases', k: 'f.diseases', type: 'area', wide: true },
      { p: 'profile.health.surgeries', k: 'f.surgeries', type: 'area', wide: true },
      { p: 'profile.health.hospitalizations', k: 'f.hospitalizations', type: 'area', wide: true },
      { p: 'profile.health.familyHistory', k: 'f.familyHistory', type: 'area', wide: true },
    ],
  },
  {
    titleKey: 'sec.lifestyle',
    fields: [
      { p: 'profile.lifestyle.sports', k: 'f.sports', type: 'select', opt: 'freq' },
      { p: 'profile.lifestyle.gym', k: 'f.gym', type: 'select', opt: 'freq' },
      { p: 'profile.lifestyle.diet', k: 'f.diet', type: 'select', opt: 'alimentacao' },
      { p: 'profile.lifestyle.sleep', k: 'f.sleep', type: 'select', opt: 'sono' },
      { p: 'profile.lifestyle.alcohol', k: 'f.alcohol', type: 'select', opt: 'alcool' },
      { p: 'profile.lifestyle.smoking', k: 'f.smoking', type: 'select', opt: 'tabagismo' },
      { p: 'profile.lifestyle.drugs', k: 'f.drugs', type: 'select', opt: 'drogas' },
      { p: 'profile.lifestyle.religion', k: 'f.religion', type: 'datalist', options: RELIGIOES },
      { p: 'profile.lifestyle.spirituality', k: 'f.spirituality', type: 'select', opt: 'espiritualidade' },
    ],
  },
  {
    titleKey: 'sec.interests',
    fields: [
      { p: 'profile.interests.books', k: 'f.books' },
      { p: 'profile.interests.movies', k: 'f.movies' },
      { p: 'profile.interests.music', k: 'f.music' },
      { p: 'profile.interests.games', k: 'f.games' },
      { p: 'profile.interests.social', k: 'f.social' },
      { p: 'profile.interests.tech', k: 'f.tech' },
      { p: 'profile.interests.hobbies', k: 'f.hobbies', wide: true },
    ],
  },
  {
    titleKey: 'sec.personality',
    fields: [
      { p: 'profile.personality.introvert', k: 'f.introvert', type: 'check' },
      { p: 'profile.personality.extrovert', k: 'f.extrovert', type: 'check' },
      { p: 'profile.personality.communicative', k: 'f.communicative', type: 'check' },
      { p: 'profile.personality.reserved', k: 'f.reserved', type: 'check' },
      { p: 'profile.personality.impulsive', k: 'f.impulsive', type: 'check' },
      { p: 'profile.personality.organized', k: 'f.organized', type: 'check' },
      { p: 'profile.personality.creative', k: 'f.creative', type: 'check' },
      { p: 'profile.personality.notes', k: 'f.notes', type: 'area', wide: true },
    ],
  },
  {
    titleKey: 'sec.relationships',
    fields: [
      { p: 'profile.relationships.family', k: 'f.relFamily', type: 'area', wide: true },
      { p: 'profile.relationships.friends', k: 'f.relFriends', type: 'area', wide: true },
      { p: 'profile.relationships.work', k: 'f.relWork', type: 'area', wide: true },
      { p: 'profile.relationships.romantic', k: 'f.relRomantic', type: 'area', wide: true },
    ],
  },
];

function FieldCtrl({ field, draft, update }: { field: Field; draft: any; update: (p: string, v: any) => void }) {
  const { t, o } = useI18n();
  const val = getPath(draft, field.p);
  const label = t(field.k);

  if (field.type === 'check') {
    return (
      <label className={`check ${field.wide ? 'wide' : ''}`}>
        <input type="checkbox" checked={!!val} onChange={(e) => update(field.p, e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }

  // opções para select
  let opts: { value: string; label: string }[] = [];
  if (field.opt === 'status') {
    opts = [{ value: 'active', label: t('status.active') }, { value: 'inactive', label: t('status.inactive') }];
  } else if (field.opt) {
    opts = o(field.opt).map((x) => ({ value: x, label: x }));
  } else if (field.options) {
    opts = field.options.map((x) => ({ value: x, label: x }));
  }
  // tolerância: valor já salvo em outro idioma continua visível
  if (val && field.type === 'select' && !opts.some((x) => x.value === val)) {
    opts = [{ value: val, label: val }, ...opts];
  }

  const dlId = `dl-${field.p.replace(/\./g, '-')}`;
  return (
    <div className={`field ${field.wide ? 'wide' : ''}`}>
      <label>{label}</label>
      {field.type === 'area' ? (
        <textarea rows={2} value={val ?? ''} onChange={(e) => update(field.p, e.target.value)} />
      ) : field.type === 'select' ? (
        <select value={val ?? (field.noEmpty ? opts[0]?.value : '')} onChange={(e) => update(field.p, e.target.value)}>
          {!field.noEmpty && <option value="">{t('sel.empty')}</option>}
          {opts.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      ) : field.type === 'datalist' ? (
        <>
          <input list={dlId} value={val ?? ''} placeholder={t('ficha.selectOrType')} onChange={(e) => update(field.p, e.target.value)} />
          <datalist id={dlId}>
            {(field.options ?? []).map((op) => (
              <option key={op} value={op} />
            ))}
          </datalist>
        </>
      ) : (
        <input type={field.type === 'date' ? 'date' : 'text'} value={val ?? ''} onChange={(e) => update(field.p, e.target.value)} />
      )}
    </div>
  );
}

function RelativeCard({ base, titleKey, draft, update }: { base: string; titleKey: string; draft: any; update: (p: string, v: any) => void }) {
  const { t } = useI18n();
  return (
    <div className="relative-card">
      <h4>{t(titleKey)}</h4>
      <div className="grid">
        <FieldCtrl field={{ p: `${base}.name`, k: 'f.name' }} draft={draft} update={update} />
        <FieldCtrl field={{ p: `${base}.alive`, k: 'f.alive', type: 'select', opt: 'simNao' }} draft={draft} update={update} />
        <FieldCtrl field={{ p: `${base}.age`, k: 'f.age' }} draft={draft} update={update} />
        <FieldCtrl field={{ p: `${base}.relation`, k: 'f.relation', type: 'select', opt: 'relacao' }} draft={draft} update={update} />
        <FieldCtrl field={{ p: `${base}.notes`, k: 'f.notes', type: 'area', wide: true }} draft={draft} update={update} />
      </div>
    </div>
  );
}

type Draft = {
  fullName: string;
  socialName: string;
  cpf: string;
  email: string;
  phone: string;
  whatsapp: string;
  status: string;
  birthDate: string;
  profile: Record<string, any>;
};

export default function FichaTab({ patient, onSaved }: { patient: Patient; onSaved: () => void }) {
  const { t, te } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => ({
    fullName: patient.fullName ?? '',
    socialName: patient.socialName ?? '',
    cpf: patient.cpf ?? '',
    email: patient.email ?? '',
    phone: patient.phone ?? '',
    whatsapp: patient.whatsapp ?? '',
    status: patient.status ?? 'active',
    birthDate: patient.birthDate ? new Date(patient.birthDate).toISOString().slice(0, 10) : '',
    profile: patient.profile ?? {},
  }));
  const [photo, setPhoto] = useState<string | null>(patient.photo ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const update = (p: string, v: any) => setDraft((d) => setPath(d, p, v));

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await fileToAvatarDataURL(f));
      setSaved(false);
    } catch {
      setError(te('generic'));
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api.updatePatient(patient.id, {
        fullName: draft.fullName || 'Sem nome',
        socialName: draft.socialName || undefined,
        cpf: draft.cpf || undefined,
        email: draft.email || undefined,
        phone: draft.phone || undefined,
        whatsapp: draft.whatsapp || undefined,
        status: draft.status === 'inactive' ? 'inactive' : 'active',
        birthDate: draft.birthDate || null,
        photo: photo,
        profile: draft.profile,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  const initials = (draft.fullName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const familyExtra: [string, string][] = [
    ['profile.family.grandparents', 'f.grandparents'],
    ['profile.family.siblings', 'f.siblings'],
    ['profile.family.uncles', 'f.uncles'],
    ['profile.family.children', 'f.children'],
    ['profile.family.spouse', 'f.spouse'],
    ['profile.family.important', 'f.important'],
  ];

  return (
    <div className="ficha-tab">
      {error && <div className="error">{error}</div>}

      <div className="photo-row">
        <div className="photo-avatar">{photo ? <img src={photo} alt="" /> : <span>{initials}</span>}</div>
        <div className="photo-actions">
          <label className="ghost">
            {photo ? t('ficha.changePhoto') : t('ficha.addPhoto')}
            <input type="file" accept="image/*" onChange={onPickPhoto} hidden />
          </label>
          {photo && (
            <button type="button" className="link-danger" onClick={() => setPhoto(null)}>
              {t('ficha.removePhoto')}
            </button>
          )}
        </div>
      </div>

      {SECTIONS.map((sec) => (
        <section className="ficha-section" key={sec.titleKey}>
          <h3>{t(sec.titleKey)}</h3>
          <div className="grid">
            {sec.fields.map((f) => (
              <FieldCtrl key={f.p} field={f} draft={draft} update={update} />
            ))}
          </div>
        </section>
      ))}

      <section className="ficha-section">
        <h3>{t('sec.family')}</h3>
        <div className="relatives">
          <RelativeCard base="profile.family.father" titleKey="f.father" draft={draft} update={update} />
          <RelativeCard base="profile.family.mother" titleKey="f.mother" draft={draft} update={update} />
        </div>
        <div className="grid">
          {familyExtra.map(([p, k]) => (
            <FieldCtrl key={p} field={{ p, k, type: 'area', wide: true }} draft={draft} update={update} />
          ))}
        </div>
      </section>

      <div className="ficha-save">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? t('btn.saving') : t('btn.saveFicha')}
        </button>
        {saved && <span className="saved-badge">{t('ficha.saved')}</span>}
      </div>
    </div>
  );
}
