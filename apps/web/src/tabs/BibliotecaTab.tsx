import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { IconTrash } from '../icons';

type FileRow = { id: string; category: string; fileName: string; mime: string | null; size: number | null; createdAt: number };

const CATS = ['receituario', 'guia', 'laudo', 'outros'] as const;
const MAX_BYTES = 15 * 1024 * 1024;

function human(size: number | null): string {
  if (!size) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function BibliotecaTab({ patientId, guiaOnly = false }: { patientId: string; guiaOnly?: boolean }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>(guiaOnly ? 'guia' : 'receituario');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.patientFiles(patientId);
      setFiles(r.files);
    } catch {
      setError(t('biblioteca.loadError'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [patientId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) {
      setError(t('biblioteca.tooLarge'));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      await api.patientFileUpload(patientId, file, category);
      if (inputRef.current) inputRef.current.value = '';
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'generic';
      setError(code === 'file_too_large' ? t('biblioteca.tooLarge') : t('biblioteca.uploadError'));
    } finally {
      setBusy(false);
    }
  }

  async function download(f: FileRow) {
    try {
      const blob = await api.patientFileBlob(patientId, f.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('biblioteca.downloadError'));
    }
  }

  async function remove(f: FileRow) {
    if (!confirm(t('biblioteca.confirmDelete').replace('{name}', f.fileName))) return;
    try {
      await api.patientFileDelete(patientId, f.id);
      load();
    } catch {
      setError(t('biblioteca.deleteError'));
    }
  }

  return (
    <div className="biblioteca">
      <div className="biblioteca-upload">
        <div className="biblioteca-upload-row">
          <label className="bib-label">{t('biblioteca.category')}</label>
          {guiaOnly ? (
            <span className="bib-cat cat-guia">{t('biblioteca.cat.guia')}</span>
          ) : (
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
              {CATS.map((c) => <option key={c} value={c}>{t(`biblioteca.cat.${c}`)}</option>)}
            </select>
          )}
          <button type="button" className="btn sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('biblioteca.sending') : t('biblioteca.add')}
          </button>
          <input ref={inputRef} type="file" hidden onChange={onPick}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,image/*,application/pdf" />
        </div>
        <p className="biblioteca-hint">{guiaOnly ? t('biblioteca.guiaOnly') : t('biblioteca.hint')}</p>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="sub">{t('biblioteca.loading')}</p>
      ) : files.length === 0 ? (
        <div className="biblioteca-empty">{t('biblioteca.empty')}</div>
      ) : (
        <ul className="biblioteca-list">
          {files.map((f) => (
            <li key={f.id} className="biblioteca-item">
              <span className={`bib-cat cat-${f.category}`}>{t(`biblioteca.cat.${f.category}`)}</span>
              <div className="bib-info">
                <span className="bib-name" title={f.fileName}>{f.fileName}</span>
                <span className="bib-meta">{human(f.size)} · {new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="bib-actions">
                <button className="ghost sm" onClick={() => download(f)}>{t('biblioteca.download')}</button>
                <button className="bib-del" title={t('biblioteca.delete')} onClick={() => remove(f)}><IconTrash size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
