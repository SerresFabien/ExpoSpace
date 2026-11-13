import { Link, useParams } from 'react-router';
import { ErrorBox, Loading, Notice } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { Gallery2D } from '../visit/Gallery2D.jsx';
import { useVisitModel } from '../visit/model.js';
import { Unavailable } from './ExhibitionPage.jsx';

export function GalleryPage({ preview = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  const { model, error, loading } = useVisitModel(id, { preview, creator: user?.displayName });
  if (loading) return <Loading />;
  if (error?.status === 404) return <Unavailable />;
  if (error) return <ErrorBox error={error} />;
  const back = preview ? `/studio/${id}` : `/expositions/${id}`;
  return (
    <>
      <p>
        <Link to={back}>← {preview ? 'Retour au studio' : 'Retour à la fiche'}</Link>
      </p>
      {preview && <Notice kind="warning">Aperçu : vous voyez la dernière version enregistrée de votre exposition.</Notice>}
      <h1>{model.title}</h1>
      <p className="muted">Galerie 2D - cliquez sur une œuvre (ou Entrée) pour ouvrir sa fiche.</p>
      <Gallery2D model={model} />
    </>
  );
}
