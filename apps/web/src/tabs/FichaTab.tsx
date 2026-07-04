import { type Patient } from '../lib/api';
import { useI18n } from '../i18n';
import { RELIGIOES } from '../locales';
import { FieldCtrl, RelativeCard, SaveBar, usePatientDraft, type Section } from './fichaShared';

// Seções técnicas/clínicas. Os dados pessoais (identificação) ficam na aba "Dados cadastrais".
const SECTIONS: Section[] = [
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
];

export default function FichaTab({ patient, onSaved }: { patient: Patient; onSaved: () => void }) {
  const { t } = useI18n();
  const { draft, update, busy, saved, error, save } = usePatientDraft(patient, onSaved);

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

      <SaveBar busy={busy} saved={saved} onSave={save} />
    </div>
  );
}
