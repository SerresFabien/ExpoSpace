// Onglet Œuvres : import, fiches, suppression.
import { useEffect, useState } from 'react';
import { ACCEPTED_IMAGE_TYPES, LIMITS } from '@expospace/shared/limits.js';
import { isArtworkReady } from '@expospace/shared/publication.js';
import { ConfirmDialog, ErrorBox, Field, Modal, fieldErrors } from '../components/ui.jsx';
import { uploadImage } from '../lib/api.js';
import { formatBytes } from '../lib/format.js';

const STATUS_LABEL = { waiting: 'En attente', sending: 'Envoi', processing: 'Traitement de l’image', done: 'Importée', error: 'Refusée' };

export function ArtworksTab({ exhibition, write, locked, apply, latest, setConflict }) {
  const [rights, setRights] = useState(false);
  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: null });

  const placement = new Map(exhibition.placements.map((p) => [p.artworkId, p]));
  const roomName = new Map(exhibition.rooms.map((r) => [r.id, r.name]));
  const remaining = LIMITS.artworksPerExhibition - exhibition.artworks.length;

  const update = (index, patch) => setQueue((q) => q.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  async function startUpload(files) {
    const items = [...files].map((file) => ({ file, name: file.name, status: 'waiting', progress: 0, error: null }));
    for (const item of items) {
      if (!ACCEPTED_IMAGE_TYPES.includes(item.file.type)) Object.assign(item, { status: 'error', error: 'Format refusé : JPEG, PNG ou WebP uniquement.' });
      else if (item.file.size > LIMITS.uploadMaxBytes) Object.assign(item, { status: 'error', error: `Fichier trop volumineux (${formatBytes(item.file.size)}) : 8 Mio au maximum.` });
    }
    const offset = queue.length;
    setQueue((q) => [...q, ...items]);
    setRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'error') continue;
      const index = offset + i;
      update(index, { status: 'sending' });
      try {
        const res = await uploadImage(exhibition.id, latest.current.etag, items[i].file, {}, (fraction) =>
          update(index, fraction >= 1 ? { status: 'processing', progress: 1 } : { progress: fraction }),
        );
        apply(res.exhibition);
        update(index, { status: 'done', progress: 1 });
      } catch (err) {
        update(index, { status: 'error', error: err.message });
        // Conflit de version : arrêt de la file.
        if (err.status === 412) {
          setConflict(true);
          for (let j = i + 1; j < items.length; j++) if (items[j].status !== 'error') update(offset + j, { status: 'error', error: 'Non envoyée : rechargez l’exposition.' });
          break;
        }
        if (err.status === 0 || err.status >= 500) {
          update(index, { error: `${err.message} Vérifiez la liste ci-dessous avant de réessayer.` });
        }
      }
    }
    setRunning(false);
  }

  async function confirmDelete() {
    setDeleteState({ busy: true, error: null });
    try {
      await write(`/artworks/${toDelete.id}`, { method: 'DELETE' });
      setToDelete(null);
      setDeleteState({ busy: false, error: null });
    } catch (error) {
      setDeleteState({ busy: false, error });
    }
  }

  return (
    <div className="tab-content">
      <section className="panel">
        <h2>Importer des images</h2>
        <p className="muted">
          JPEG, PNG ou WebP, 8 Mio et 20 millions de pixels au maximum. Les images sont réduites (2048 px) et leurs métadonnées retirées. {exhibition.artworks.length} /{' '}
          {LIMITS.artworksPerExhibition} œuvres.
        </p>
        {locked ? (
          <p className="notice notice-warning">Exposition publiée : dépubliez-la pour importer de nouvelles images.</p>
        ) : remaining <= 0 ? (
          <p className="notice notice-warning">Limite de {LIMITS.artworksPerExhibition} œuvres atteinte pour cette exposition.</p>
        ) : (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> Je déclare disposer des droits nécessaires pour diffuser ces
              images.
            </label>
            <label className={`file-drop${!rights || running ? ' file-drop-disabled' : ''}`}>
              <span>{running ? 'Import en cours…' : 'Choisir des images…'}</span>
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                disabled={!rights || running}
                onChange={(e) => {
                  startUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
        {queue.length > 0 && (
          <ul className="upload-queue" aria-live="polite">
            {queue.map((item, i) => (
              <li key={i} className={`upload-item upload-${item.status}`}>
                <span className="upload-name">{item.name}</span>
                <span>
                  {STATUS_LABEL[item.status]}
                  {item.status === 'sending' ? ` ${Math.round(item.progress * 100)} %` : ''}
                </span>
                {item.status === 'sending' && <progress max="1" value={item.progress} aria-label={`Envoi de ${item.name}`} />}
                {item.error && <span className="upload-error">{item.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2>Œuvres importées</h2>
      {exhibition.artworks.length === 0 ? (
        <p className="empty">Aucune œuvre pour l’instant.</p>
      ) : (
        <ul className="artwork-grid">
          {exhibition.artworks.map((art) => {
            const p = placement.get(art.id);
            return (
              <li key={art.id} className="artwork-card">
                <img src={art.thumbnailUrl} alt={art.altText || ''} loading="lazy" />
                <div className="artwork-card-body">
                  <p className="artwork-card-title">{art.title || <em>Sans titre</em>}</p>
                  <p className="artwork-card-meta">
                    {p ? <span className="badge badge-success">Placée : {exhibition.rooms.length > 1 ? `${roomName.get(p.roomId)}, ` : ''}{p.slotCode}</span> : <span className="badge">Non placée</span>}{' '}
                    {!isArtworkReady(art) && <span className="badge badge-warning">Fiche incomplète</span>}
                  </p>
                  <p className="muted small">
                    {art.widthPx} × {art.heightPx} px · {formatBytes(art.byteSize)}
                  </p>
                  <div className="actions">
                    <button type="button" onClick={() => setEditing(art)} disabled={locked}>
                      Modifier la fiche
                    </button>
                    <button type="button" className="button-danger-outline" onClick={() => setToDelete(art)} disabled={locked}>
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SheetDialog artwork={editing} write={write} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Supprimer cette œuvre ?"
        confirmLabel="Supprimer"
        danger
        busy={deleteState.busy}
        onConfirm={confirmDelete}
        onCancel={() => {
          setToDelete(null);
          setDeleteState({ busy: false, error: null });
        }}
      >
        <p>
          La fiche <strong>{toDelete?.title || 'sans titre'}</strong> et son image seront supprimées définitivement. Si elle est accrochée, sa place sera libérée
          {exhibition.coverArtworkId === toDelete?.id ? ' et il faudra choisir une nouvelle couverture' : ''}.
        </p>
        <ErrorBox error={deleteState.error} title="Suppression impossible" />
      </ConfirmDialog>
    </div>
  );
}

function SheetDialog({ artwork, write, onClose }) {
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });

  useEffect(() => {
    if (artwork) {
      setForm({ title: artwork.title, artistName: artwork.artistName, description: artwork.description, altText: artwork.altText });
      setState({ busy: false, error: null });
    }
  }, [artwork]);

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      await write(`/artworks/${artwork.id}`, { method: 'PATCH', body: form });
      onClose();
    } catch (error) {
      setState({ busy: false, error });
    }
  }

  const fields = fieldErrors(state.error);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal open={Boolean(artwork)} onClose={onClose} title="Fiche de l’œuvre" wide>
      {artwork && form && (
        <form onSubmit={submit} className="form sheet-form" noValidate>
          <img src={artwork.thumbnailUrl} alt="" className="sheet-preview" />
          <div>
            <ErrorBox error={state.error && !Object.keys(fields).length ? state.error : null} title="Enregistrement impossible" />
            <Field label="Titre (obligatoire pour publier)" value={form.title} onChange={set('title')} maxLength={LIMITS.artworkTitleMax} error={fields.title} />
            <Field label="Auteur ou autrice" hint="Laissez vide si inconnu." value={form.artistName} onChange={set('artistName')} maxLength={LIMITS.artworkArtistMax} error={fields.artistName} />
            <Field
              label="Texte alternatif (obligatoire pour publier)"
              hint="Décrivez l’image en une phrase pour les personnes qui ne la voient pas."
              value={form.altText}
              onChange={set('altText')}
              maxLength={LIMITS.artworkAltMax}
              counter
              error={fields.altText}
            />
            <Field label="Description" multiline rows={5} value={form.description} onChange={set('description')} maxLength={LIMITS.artworkDescriptionMax} counter error={fields.description} />
            <div className="actions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="button-primary" disabled={state.busy}>
                {state.busy ? 'Enregistrement…' : 'Enregistrer la fiche'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
