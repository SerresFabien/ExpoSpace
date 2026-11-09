// Onglet Informations.
import { useEffect, useState } from 'react';
import { LIMITS } from '@expospace/shared/limits.js';
import { ErrorBox, Field, fieldErrors } from '../components/ui.jsx';

export function InfoTab({ exhibition, write, locked, markDirty }) {
  const server = { title: exhibition.title, description: exhibition.description, coverArtworkId: exhibition.coverArtworkId };
  const [form, setForm] = useState(server);
  const [state, setState] = useState({ busy: false, error: null, saved: false });
  const dirty = form.title !== server.title || form.description !== server.description || form.coverArtworkId !== server.coverArtworkId;
  useEffect(() => markDirty('infos', dirty), [dirty, markDirty]);
  useEffect(() => {
    if (!dirty) setForm({ title: exhibition.title, description: exhibition.description, coverArtworkId: exhibition.coverArtworkId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibition.title, exhibition.description, exhibition.coverArtworkId]);

  const placedIds = new Set(exhibition.placements.map((p) => p.artworkId));
  const placed = exhibition.artworks.filter((a) => placedIds.has(a.id));
  const coverNotPlaced = form.coverArtworkId && !placedIds.has(form.coverArtworkId);

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: null, saved: false });
    try {
      await write('', { method: 'PATCH', body: form });
      setState({ busy: false, error: null, saved: true });
    } catch (error) {
      setState({ busy: false, error, saved: false });
    }
  }

  const fields = fieldErrors(state.error);
  return (
    <div className="tab-content narrow-left">
      <form onSubmit={submit} className="form" noValidate>
        <fieldset disabled={locked}>
          <ErrorBox error={state.error && !Object.keys(fields).length ? state.error : null} title="Enregistrement impossible" />
          <Field label="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={LIMITS.exhibitionTitleMax} required error={fields.title} />
          <Field
            label="Description"
            hint="Texte brut, sans mise en forme. Les retours à la ligne sont conservés."
            multiline
            rows={6}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={LIMITS.exhibitionDescriptionMax}
            counter
            error={fields.description}
          />
          <div className="field">
            <span className="field-label" id="cover-label">
              Couverture
            </span>
            <p className="field-hint">Choisie parmi les œuvres placées dans une salle ; elle illustre la carte du catalogue.</p>
            {placed.length === 0 ? (
              <p className="notice notice-info">Placez d’abord au moins une œuvre (onglet « Salle et accrochage »).</p>
            ) : (
              <ul className="choice-list cover-list" role="radiogroup" aria-labelledby="cover-label">
                {placed.map((art) => (
                  <li key={art.id}>
                    <label className="choice">
                      <input type="radio" name="cover" checked={form.coverArtworkId === art.id} onChange={() => setForm({ ...form, coverArtworkId: art.id })} />
                      <img src={art.thumbnailUrl} alt="" />
                      <span>{art.title || <em>Sans titre</em>}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {coverNotPlaced && <p className="field-error">La couverture actuelle n’est plus placée : choisissez-en une autre.</p>}
            {fields.coverArtworkId && <p className="field-error">{fields.coverArtworkId}</p>}
          </div>
          <button type="submit" className="button-primary" disabled={!dirty || state.busy}>
            {state.busy ? 'Enregistrement…' : 'Enregistrer les informations'}
          </button>{' '}
          {dirty ? <span className="muted">Modifications non enregistrées</span> : state.saved && <span role="status">Enregistré ✓</span>}
        </fieldset>
      </form>
    </div>
  );
}
