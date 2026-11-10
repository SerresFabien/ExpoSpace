// Onglet Publication.
import { useState } from 'react';
import { publicationProblems } from '@expospace/shared/publication.js';
import { ConfirmDialog, ErrorBox, Notice, fieldErrors } from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';

export function PublishTab({ exhibition, write, anyDirty, dirtyTabs = [], onDeleted }) {
  const [state, setState] = useState({ busy: false, error: null });
  const [confirm, setConfirm] = useState(null);
  const [copied, setCopied] = useState(false);
  const problems = publicationProblems(exhibition);
  const published = exhibition.status === 'PUBLISHED';
  const publicUrl = `${window.location.origin}/expositions/${exhibition.id}`;

  async function run(path, method = 'POST') {
    setState({ busy: true, error: null });
    try {
      await write(path, { method });
      setState({ busy: false, error: null });
      setConfirm(null);
      return true;
    } catch (error) {
      setState({ busy: false, error });
      return false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const serverProblems = Object.values(fieldErrors(state.error));

  return (
    <div className="tab-content narrow-left">
      {published ? (
        <section className="panel">
          <h2>Exposition publiée</h2>
          <p>Publiée le {formatDate(exhibition.publishedAt)}. Elle apparaît au catalogue et se visite sans compte.</p>
          {!exhibition.suspended && (
            <p className="share">
              <a href={publicUrl}>{publicUrl}</a>{' '}
              <button type="button" onClick={copyLink}>
                {copied ? 'Lien copié ✓' : 'Copier le lien'}
              </button>
            </p>
          )}
          <button type="button" onClick={() => setConfirm('unpublish')}>
            Dépublier pour modifier
          </button>
        </section>
      ) : (
        <section className="panel">
          <h2>Avant de publier</h2>
          {exhibition.suspended && <Notice kind="error">Exposition masquée par l’équipe : la publication est impossible.</Notice>}
          {problems.length === 0 ? (
            <p className="notice notice-success">Tout est prêt : titre, couverture placée et au moins une œuvre complète par salle.</p>
          ) : (
            <ul className="checklist">
              {problems.map((p) => (
                <li key={p.key}>{p.message}</li>
              ))}
            </ul>
          )}
          {anyDirty && (
            <Notice kind="warning">
              Des modifications ne sont pas enregistrées
              {dirtyTabs.length > 0 && ` dans ${dirtyTabs.length > 1 ? 'les onglets' : 'l’onglet'} « ${dirtyTabs.join(' », « ')} »`} : enregistrez-les avant de
              publier.
            </Notice>
          )}
          <button type="button" className="button-primary" onClick={() => run('/publish')} disabled={state.busy || problems.length > 0 || anyDirty || exhibition.suspended}>
            {state.busy ? 'Publication…' : 'Publier l’exposition'}
          </button>
        </section>
      )}

      <ErrorBox error={confirm ? null : state.error} title="Action impossible">
        {serverProblems.length > 0 && (
          <ul>
            {serverProblems.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </ErrorBox>

      <section className="panel panel-danger">
        <h2>Supprimer l’exposition</h2>
        <p>Supprime définitivement l’exposition, ses salles, ses fiches et ses images. Il n’y a pas de corbeille.</p>
        <button type="button" className="button-danger-outline" onClick={() => setConfirm('delete')}>
          Supprimer définitivement
        </button>
      </section>

      <ConfirmDialog
        open={confirm === 'unpublish'}
        title="Dépublier l’exposition ?"
        confirmLabel="Dépublier"
        busy={state.busy}
        onConfirm={() => run('/unpublish')}
        onCancel={() => setConfirm(null)}
      >
        <p>Le lien public sera temporairement indisponible pendant vos modifications. Après correction, republiez : le même lien fonctionnera à nouveau.</p>
        <ErrorBox error={state.error} />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Supprimer définitivement ?"
        confirmLabel="Supprimer définitivement"
        danger
        busy={state.busy}
        onConfirm={async () => {
          if (await run('', 'DELETE')) onDeleted();
        }}
        onCancel={() => setConfirm(null)}
      >
        <p>
          <strong>{exhibition.title}</strong> et toutes ses images seront supprimées. Cette action ne peut pas être annulée.
        </p>
        <ErrorBox error={state.error} />
      </ConfirmDialog>
    </div>
  );
}
