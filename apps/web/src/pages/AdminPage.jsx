import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';

export function AdminPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const exhibitions = useApi(`/admin/exhibitions?q=${encodeURIComponent(search)}`);
  const users = useApi(`/admin/users?q=${encodeURIComponent(search)}`);
  const [actionError, setActionError] = useState(null);

  async function act(path, reload) {
    setActionError(null);
    try {
      await api(path, { method: 'POST' });
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <>
      <h1>Administration</h1>
      <p className="muted">Suspendre masque immédiatement le contenu public. Un compte suspendu est déconnecté et ne peut plus se connecter.</p>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <label htmlFor="admin-q">Filtrer (titre, identifiant ou nom)</label>
        <input id="admin-q" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">Filtrer</button>
      </form>
      <ErrorBox error={actionError} title="Action refusée" />

      <h2>Expositions publiées ou masquées</h2>
      {exhibitions.loading && <Loading />}
      <ErrorBox error={exhibitions.error} />
      {exhibitions.data && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Titre</th>
              <th scope="col">Auteur</th>
              <th scope="col">État</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {exhibitions.data.exhibitions.map((e) => (
              <tr key={e.id}>
                <td>{e.status === 'PUBLISHED' && !e.suspended ? <Link to={`/expositions/${e.id}`}>{e.title}</Link> : e.title}</td>
                <td>
                  {e.owner.displayName} ({e.owner.username})
                </td>
                <td>{e.suspended ? 'Masquée' : e.status === 'PUBLISHED' ? 'Publiée' : 'Brouillon'}</td>
                <td>
                  {e.suspended ? (
                    <button type="button" onClick={() => act(`/admin/exhibitions/${e.id}/unsuspend`, exhibitions.reload)}>
                      Rétablir
                    </button>
                  ) : (
                    <button type="button" className="button-danger-outline" onClick={() => act(`/admin/exhibitions/${e.id}/suspend`, exhibitions.reload)}>
                      Masquer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Comptes</h2>
      {users.loading && <Loading />}
      <ErrorBox error={users.error} />
      {users.data && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Identifiant</th>
              <th scope="col">Nom affiché</th>
              <th scope="col">Expositions</th>
              <th scope="col">État</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.data.users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.displayName}</td>
                <td>{u.exhibitionCount}</td>
                <td>{u.role === 'ADMIN' ? 'Administrateur' : u.suspended ? 'Suspendu' : 'Actif'}</td>
                <td>
                  {u.role === 'ADMIN' ? null : u.suspended ? (
                    <button type="button" onClick={() => act(`/admin/users/${u.id}/unsuspend`, users.reload)}>
                      Rétablir
                    </button>
                  ) : (
                    <button type="button" className="button-danger-outline" onClick={() => act(`/admin/users/${u.id}/suspend`, users.reload)}>
                      Suspendre
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
