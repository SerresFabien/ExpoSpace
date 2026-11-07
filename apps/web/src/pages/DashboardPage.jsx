import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LIMITS } from '@expospace/shared/limits.js';
import { ConfirmDialog, ErrorBox, Field, Loading, StatusBadge, fieldErrors } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatDate, plural } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi('/me/exhibitions');
  const [form, setForm] = useState({ title: '', description: '' });
  const [createState, setCreateState] = useState({ busy: false, error: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: null });

  const list = data?.exhibitions ?? [];
  const full = list.length >= LIMITS.exhibitionsPerUser;

  async function create(e) {
    e.preventDefault();
    setCreateState({ busy: true, error: null });
    try {
      const res = await api('/me/exhibitions', { method: 'POST', body: form });
      navigate(`/studio/${res.exhibition.id}`);
    } catch (error) {
      setCreateState({ busy: false, error });
    }
  }

  async function confirmDelete() {
    setDeleteState({ busy: true, error: null });
    try {
      await api(`/me/exhibitions/${toDelete.id}`, { method: 'DELETE', etag: toDelete.etag });
      setToDelete(null);
      setDeleteState({ busy: false, error: null });
      reload();
    } catch (error) {
      setDeleteState({ busy: false, error });
    }
  }

  const fields = fieldErrors(createState.error);

  return (
    <>
      <h1>Mes expositions</h1>
      {loading && <Loading />}
      <ErrorBox error={error}>
        <button type="button" onClick={reload}>
          Réessayer
        </button>
      </ErrorBox>

      {data && list.length === 0 && <p className="empty">Vous n’avez pas encore d’exposition. Commencez par lui donner un titre ci-dessous.</p>}
      {list.length > 0 && (
        <ul className="dashboard-list">
          {list.map((ex) => (
            <li key={ex.id} className="dashboard-item">
              {ex.coverThumbnailUrl ? <img src={ex.coverThumbnailUrl} alt="" className="dashboard-cover" /> : <div className="dashboard-cover card-cover-empty" />}
              <div className="dashboard-text">
                <h2>
                  <Link to={`/studio/${ex.id}`}>{ex.title}</Link>
                </h2>
                <p>
                  <StatusBadge status={ex.status} suspended={ex.suspended} /> {plural(ex.artworkCount, 'œuvre', 'œuvres')}, dont {ex.placedCount} placée{ex.placedCount > 1 ? 's' : ''} · modifiée le {formatDate(ex.updatedAt)}
                </p>
              </div>
              <div className="actions">
                <Link to={`/studio/${ex.id}`} className="button">
                  Ouvrir
                </Link>
                <Link to={`/studio/${ex.id}/visite`} className="button">
                  Prévisualiser
                </Link>
                {ex.status === 'PUBLISHED' && !ex.suspended && (
                  <Link to={`/expositions/${ex.id}`} className="button">
                    Page publique
                  </Link>
                )}
                <button type="button" className="button-danger-outline" onClick={() => setToDelete(ex)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="panel">
        <h2>Nouvelle exposition</h2>
        <p className="muted">
          {list.length} / {LIMITS.exhibitionsPerUser} expositions utilisées.
        </p>
        {full ? (
          <p className="notice notice-warning">Vous avez atteint la limite de {LIMITS.exhibitionsPerUser} expositions. Supprimez-en une pour en créer une nouvelle.</p>
        ) : (
          <form onSubmit={create} className="form" noValidate>
            <ErrorBox error={createState.error && !Object.keys(fields).length ? createState.error : null} />
            <Field label="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={LIMITS.exhibitionTitleMax} required error={fields.title} />
            <Field
              label="Description courte (facultative)"
              multiline
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={LIMITS.exhibitionDescriptionMax}
              counter
              error={fields.description}
            />
            <button type="submit" className="button-primary" disabled={createState.busy}>
              {createState.busy ? 'Création…' : 'Créer l’exposition'}
            </button>
          </form>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Supprimer définitivement ?"
        confirmLabel="Supprimer définitivement"
        danger
        busy={deleteState.busy}
        onConfirm={confirmDelete}
        onCancel={() => {
          setToDelete(null);
          setDeleteState({ busy: false, error: null });
        }}
      >
        <p>
          L’exposition <strong>{toDelete?.title}</strong>, ses salles, ses fiches et toutes ses images seront supprimées. Il n’y a pas de corbeille : cette action est
          définitive.
        </p>
        <ErrorBox error={deleteState.error} title="Suppression impossible">
          {deleteState.error?.status === 412 && <p>Rechargez la page pour voir la dernière version, puis réessayez.</p>}
        </ErrorBox>
      </ConfirmDialog>
    </>
  );
}
