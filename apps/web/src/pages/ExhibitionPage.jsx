import { Link, useParams } from 'react-router';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { formatDate, plural } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';
import { webglAvailable } from '../lib/webgl.js';

export function ExhibitionPage() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/exhibitions/${id}`);
  if (loading) return <Loading />;
  if (error?.status === 404) return <Unavailable />;
  if (error) return <ErrorBox error={error} title="Exposition indisponible" />;
  const ex = data.exhibition;
  const count = ex.rooms.reduce((n, r) => n + r.placements.length, 0);
  const has3d = webglAvailable();
  return (
    <article className="exhibition-page">
      {ex.cover && <img src={ex.cover.url} alt={ex.cover.alt} className="exhibition-cover" />}
      <h1>{ex.title}</h1>
      <p className="muted">
        par {ex.creator} · {plural(count, 'œuvre', 'œuvres')} · {plural(ex.rooms.length, 'salle', 'salles')} · publiée le {formatDate(ex.publishedAt)}
      </p>
      {ex.description && <p className="exhibition-description">{ex.description}</p>}
      <div className="actions actions-large">
        {has3d ? (
          <Link to={`/expositions/${ex.id}/visite`} className="button button-primary">
            Visiter en 3D
          </Link>
        ) : (
          <p className="notice notice-info">La visite 3D n’est pas disponible sur cet appareil (WebGL absent). La galerie 2D présente les mêmes œuvres.</p>
        )}
        <Link to={`/expositions/${ex.id}/galerie`} className="button">
          Voir les œuvres en 2D
        </Link>
      </div>
      <p className="muted small">Sur téléphone, la galerie 2D est la plus confortable.</p>
    </article>
  );
}

export function Unavailable() {
  return (
    <div className="narrow">
      <h1>Exposition indisponible</h1>
      <p>Cette exposition n’existe pas, n’est pas publiée ou est temporairement en cours de modification par son auteur.</p>
      <Link to="/">Retour au catalogue</Link>
    </div>
  );
}
