import { useState } from 'react';
import { api, type Patient } from '../lib/api';
import { useI18n } from '../i18n';

export function getPath(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj: any, path: string, value: any) {
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

export type Field = {
  p: string;
  k: string;
  type?: 'text' | 'area' | 'check' | 'date' | 'select' | 'datalist';
  opt?: string; // conjunto traduzido (O)
  options?: string[]; // lista fixa (datalist / estados)
  noEmpty?: boolean;
  wide?: boolean;
  mask?: 'cpf' | 'phone' | 'cep'; // formatação automática
  cap?: boolean; // capitaliza nomes (joão silva -> João Silva)
};

// Capitaliza nomes respeitando conectores (de, da, dos, e...).
const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von', 'la', 'y']);
export function capitalizeName(raw: string): string {
  return raw
    .toLocaleLowerCase('pt-BR')
    .split(/(\s+)/) // mantém os espaços
    .map((part) => {
      if (/^\s+$/.test(part) || part === '') return part;
      if (LOWER_WORDS.has(part)) return part;
      return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1);
    })
    .join('');
}

// Máscaras de formatação automática.
export function applyMask(kind: 'cpf' | 'phone' | 'cep', raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (kind === 'cpf') {
    return d
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  if (kind === 'cep') {
    return d.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  }
  // phone / whatsapp: (11) 98888-7777 ou (11) 3333-4444
  const p = d.slice(0, 11);
  if (p.length <= 10) {
    return p
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return p
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}
export type Section = { titleKey: string; fields: Field[] };

export type Draft = {
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

export function makeDraft(patient: Patient): Draft {
  return {
    fullName: patient.fullName ?? '',
    socialName: patient.socialName ?? '',
    cpf: patient.cpf ?? '',
    email: patient.email ?? '',
    phone: patient.phone ?? '',
    whatsapp: patient.whatsapp ?? '',
    status: patient.status ?? 'active',
    birthDate: patient.birthDate ? new Date(patient.birthDate).toISOString().slice(0, 10) : '',
    profile: patient.profile ?? {},
  };
}

/**
 * Estado + salvamento compartilhado entre as abas Dados cadastrais e Ficha.
 * Ambas editam o mesmo registro do paciente (campos base + profile).
 */
export function usePatientDraft(patient: Patient, onSaved: () => void) {
  const { te } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => makeDraft(patient));
  const [photo, setPhoto] = useState<string | null>(patient.photo ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const update = (p: string, v: any) => {
    setDraft((d) => setPath(d, p, v));
    setSaved(false);
  };

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

  return { draft, update, photo, setPhoto, busy, saved, setSaved, error, setError, save };
}

export function FieldCtrl({
  field,
  draft,
  update,
}: {
  field: Field;
  draft: any;
  update: (p: string, v: any) => void;
}) {
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
    opts = [
      { value: 'active', label: t('status.active') },
      { value: 'inactive', label: t('status.inactive') },
    ];
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
        <input
          type={field.type === 'date' ? 'date' : 'text'}
          value={val ?? ''}
          inputMode={field.mask ? 'numeric' : undefined}
          onChange={(e) => update(field.p, field.mask ? applyMask(field.mask, e.target.value) : e.target.value)}
          onBlur={field.cap ? (e) => update(field.p, capitalizeName(e.target.value)) : undefined}
        />
      )}
    </div>
  );
}

export function RelativeCard({
  base,
  titleKey,
  draft,
  update,
}: {
  base: string;
  titleKey: string;
  draft: any;
  update: (p: string, v: any) => void;
}) {
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

export function SaveBar({ busy, saved, onSave }: { busy: boolean; saved: boolean; onSave: () => void }) {
  const { t } = useI18n();
  return (
    <div className="ficha-save">
      <button className="btn" onClick={onSave} disabled={busy}>
        {busy ? t('btn.saving') : t('btn.saveFicha')}
      </button>
      {saved && <span className="saved-badge">{t('ficha.saved')}</span>}
    </div>
  );
}
