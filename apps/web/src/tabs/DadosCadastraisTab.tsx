import { useState } from 'react';
import { type Patient } from '../lib/api';
import { fileToAvatarDataURL } from '../lib/photo';
import { useI18n } from '../i18n';
import { ESTADOS, PROFISSOES } from '../locales';
import { FieldCtrl, SaveBar, usePatientDraft, type Section } from './fichaShared';

const SECTIONS: Section[] = [
  {
    titleKey: 'sec.personal',
    fields: [
      { p: 'fullName', k: 'f.fullName', cap: true },
      { p: 'socialName', k: 'f.socialName', cap: true },
      { p: 'profile.personal.isChild', k: 'f.isChild', type: 'check', wide: true },
      { p: 'profile.personal.sex', k: 'f.sex', type: 'select', opt: 'sexo' },
      { p: 'profile.personal.gender', k: 'f.gender', type: 'select', opt: 'genero' },
      { p: 'cpf', k: 'f.cpf', mask: 'cpf' },
      { p: 'profile.personal.rg', k: 'f.rg' },
      { p: 'profile.personal.maritalStatus', k: 'f.marital', type: 'select', opt: 'estadoCivil' },
      { p: 'birthDate', k: 'f.birth', type: 'date' },
      { p: 'phone', k: 'f.phone', mask: 'phone' },
      { p: 'whatsapp', k: 'f.whatsapp', mask: 'phone' },
      { p: 'email', k: 'f.email' },
      { p: 'profile.personal.profession', k: 'f.profession', type: 'datalist', options: PROFISSOES },
      { p: 'profile.personal.company', k: 'f.company' },
      { p: 'profile.personal.education', k: 'f.education', type: 'select', opt: 'escolaridade' },
      { p: 'profile.personal.address', k: 'f.address', wide: true },
      { p: 'profile.personal.city', k: 'f.city', cap: true },
      { p: 'profile.personal.state', k: 'f.state', type: 'select', options: ESTADOS },
      { p: 'profile.personal.zip', k: 'f.zip', mask: 'cep' },
      { p: 'status', k: 'f.status', type: 'select', opt: 'status', noEmpty: true },
    ],
  },
];

export default function DadosCadastraisTab({ patient, onSaved }: { patient: Patient; onSaved: () => void }) {
  const { t, te } = useI18n();
  const { draft, update, photo, setPhoto, busy, saved, setSaved, error, setError, save } = usePatientDraft(patient, onSaved);
  const [cepBusy, setCepBusy] = useState(false);

  // Ao digitar o CEP, quando completar 8 dígitos, busca o endereço (ViaCEP).
  async function smartUpdate(path: string, value: any) {
    update(path, value);
    if (path === 'profile.personal.zip') {
      const digits = String(value).replace(/\D/g, '');
      if (digits.length === 8) {
        setCepBusy(true);
        try {
          const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
          const data = await res.json();
          if (!data.erro) {
            const rua = [data.logradouro, data.bairro].filter(Boolean).join(', ');
            if (rua) update('profile.personal.address', rua);
            if (data.localidade) update('profile.personal.city', data.localidade);
            if (data.uf) update('profile.personal.state', data.uf);
          }
        } catch {
          /* silencioso: se o ViaCEP falhar, o usuário preenche manualmente */
        } finally {
          setCepBusy(false);
        }
      }
    }
  }

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

  const initials = (draft.fullName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

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

      {cepBusy && <div className="cep-hint">{t('cep.searching')}</div>}

      {SECTIONS.map((sec) => (
        <section className="ficha-section" key={sec.titleKey}>
          <h3>{t(sec.titleKey)}</h3>
          <div className="grid">
            {sec.fields.map((f) => (
              <FieldCtrl key={f.p} field={f} draft={draft} update={smartUpdate} />
            ))}
          </div>
        </section>
      ))}

      <SaveBar busy={busy} saved={saved} onSave={save} />
    </div>
  );
}
