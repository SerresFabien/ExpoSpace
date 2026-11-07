import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { formatDate, plural } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = (params.get('q') ?? '').trim();
  const query = new URLSearchParams({ page: String(page), ...(q && { q }) });
  const { data, error, loading, reload } = useApi(`/exhibitions?${query}`);
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const goTo = (p, text = q) => {
    setParams({ ...(p > 1 && { page: String(p) }), ...(text && { q: text }) });
    window.scrollTo(0, 0);
  };

  function submit(e) {
    e.preventDefault();
    goTo(1, search.trim());
  }

  return (
    <>
      <section className="hero">
        <h1>Créez votre exposition, visitez celles des autres en 3D</h1>
        <p>Importez vos images, accrochez-les aux murs d’une galerie et partagez un lien. Les visiteurs s’y promènent librement, sans compte.</p>
        <p>
          <Link to="/studio" className="button button-primary">
            Créer mon exposition
          </Link>
        </p>
      </section>

      <h2>Expositions publiées</h2>
      <form className="search-bar" role="search" onSubmit={submit}>
        <label htmlFor="catalog-search">Rechercher par titre</label>
        <input id="catalog-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={120} />
        <button type="submit">Rechercher</button>
        {q && (
          <button type="button" className="button-link" onClick={() => goTo(1, '')}>
            Tout afficher
          </button>
        )}
      </form>
      {data && q && (
        <p role="status">
          {plural(data.total, 'exposition trouvée', 'expositions trouvées')} pour « {q} ».
        </p>
      )}
      {loading && <Loading label="Chargement du catalogue…" />}
      <ErrorBox error={error} title="Le catalogue n’a pas pu être chargé">
        <button type="button" onClick={reload}>
          Réessayer
        </button>
      </ErrorBox>
      {data && data.items.length === 0 && (
        <p className="empty">{q ? `Aucune exposition ne correspond à « ${q} ».` : 'Aucune exposition publiée pour le moment. Soyez la première ou le premier !'}</p>
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="card-grid">
            {data.items.map((ex) => (
              <li key={ex.id} className="card">
                <Link to={`/expositions/${ex.id}`} className="card-link">
                  {ex.cover ? <img src={ex.cover.url} alt={ex.cover.alt} className="card-cover" loading="lazy" /> : <div className="card-cover card-cover-empty" />}
                  <span className="card-title">{ex.title}</span>
                </Link>
                <p className="card-meta">
                  par {ex.creator} · {plural(ex.artworkCount, 'œuvre', 'œuvres')}
                  {' · '}
                  <strong>{plural(ex.visitors ?? 0, 'personne', 'personnes')} en visite</strong>
                  <br />
                  <span className="muted">publiée le {formatDate(ex.publishedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <nav className="pagination" aria-label="Pages du catalogue">
              <button type="button" onClick={() => goTo(page - 1)} disabled={page <= 1}>
                ← Précédente
              </button>
              <span aria-current="page">
                Page {page} sur {data.totalPages}
              </span>
              <button type="button" onClick={() => goTo(page + 1)} disabled={page >= data.totalPages}>
                Suivante →
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
