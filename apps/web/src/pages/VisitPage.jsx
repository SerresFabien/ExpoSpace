// Visite 3D.
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArtworkDialog } from '../components/ArtworkDialog.jsx';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { webglAvailable } from '../lib/webgl.js';
import { useVisitModel } from '../visit/model.js';
import { Unavailable } from './ExhibitionPage.jsx';

const Viewer3D = lazy(() => import('../three/Viewer3D.jsx'));
const RoomChat = lazy(() => import('../visit/RoomChat.jsx'));

class ViewerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fallback({ galleryUrl, reason }) {
  return (
    <div className="visit-fallback" role="alert">
      <h2>La visite 3D n’est pas disponible</h2>
      <p>{reason === 'webgl' ? 'Votre navigateur ou votre appareil ne prend pas en charge WebGL.' : 'L’affichage 3D a rencontré un problème sur cet appareil.'}</p>
      <p>
        <Link to={galleryUrl} className="button button-primary">
          Voir les œuvres en galerie 2D
        </Link>
      </p>
    </div>
  );
}

export function VisitPage({ preview = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  const { model, error, loading } = useVisitModel(id, { preview, creator: user?.displayName });
  const [roomIndex, setRoomIndex] = useState(0);
  const [arrivalSlot, setArrivalSlot] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [current, setCurrent] = useState(null);
  const [helpOpen, setHelpOpen] = useState(true);
  const [locked, setLocked] = useState(false);
  const [broken, setBroken] = useState(false);
  const [announce, setAnnounce] = useState('');
  const viewer = useRef(null);
  const webgl = useMemo(webglAvailable, []);

  useEffect(() => {
    // Pied de page visible sous la salle.
    document.body.classList.add('visit-mode');
    return () => document.body.classList.remove('visit-mode');
  }, []);

  const base = preview ? `/studio/${id}` : `/expositions/${id}`;
  const galleryUrl = preview ? `/studio/${id}/apercu` : `/expositions/${id}/galerie`;
  const room = model?.rooms[roomIndex];
  const items = useMemo(() => room?.items ?? [], [room]);
  const openArtwork = items.find((a) => a.id === openId) ?? null;

  const select = useCallback((artworkId) => setOpenId(artworkId), []);
  const closeSheet = useCallback(() => {
    setOpenId(null);
    viewer.current?.focus();
  }, []);

  function goToArtwork(step) {
    if (!items.length) return;
    const next = current === null ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length;
    setCurrent(next);
    viewer.current?.viewSlot(items[next].slotCode);
    setAnnounce(`Œuvre ${next + 1} sur ${items.length} : ${items[next].title || 'sans titre'}`);
  }

  // Arrivée devant une porte de retour, sinon à l'entrée.
  const enterRoom = useCallback(
    (next) => {
      if (!model || next < 0 || next >= model.rooms.length || next === roomIndex) return;
      const from = model.rooms[roomIndex].id;
      const target = model.rooms[next];
      setArrivalSlot(target.doors.find((d) => d.targetRoomId === from)?.slotCode ?? null);
      setRoomIndex(next);
      setCurrent(null);
      setAnnounce(`Salle ${next + 1} sur ${model.rooms.length} : ${target.name}`);
    },
    [model, roomIndex],
  );
  const goToRoom = (step) => enterRoom(roomIndex + step);
  const openDoor = useCallback((targetRoomId) => enterRoom(model.rooms.findIndex((r) => r.id === targetRoomId)), [enterRoom, model]);

  if (loading) return <Loading label="Préparation de la visite…" />;
  if (error?.status === 404) return <Unavailable />;
  if (error) return <ErrorBox error={error} />;

  const multiRoom = model.rooms.length > 1;

  return (
    <div className="visit">
      <header className="visit-bar">
        <Link to={base} className="visit-back">
          ← {preview ? 'Retour au studio' : 'Quitter la visite'}
        </Link>
        <p className="visit-title">
          <strong>{model.title}</strong>
          <span>
            {multiRoom ? `Salle ${roomIndex + 1}/${model.rooms.length} - ` : ''}
            {room.name}
            {preview ? ' · aperçu' : ''}
          </span>
        </p>
        <div className="visit-tools" role="toolbar" aria-label="Commandes de la visite">
          <button type="button" onClick={() => goToArtwork(-1)} disabled={!items.length}>
            ◀ Œuvre précédente
          </button>
          <button type="button" onClick={() => goToArtwork(1)} disabled={!items.length}>
            Œuvre suivante ▶
          </button>
          {current !== null && items[current] && (
            <button type="button" onClick={() => select(items[current].id)}>
              Voir la fiche
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              viewer.current?.recenter();
              setCurrent(null);
              setAnnounce('Retour à l’entrée de la salle');
            }}
          >
            Recentrer
          </button>
          {multiRoom && (
            <>
              <button type="button" onClick={() => goToRoom(-1)} disabled={roomIndex === 0}>
                Salle précédente
              </button>
              <button type="button" onClick={() => goToRoom(1)} disabled={roomIndex === model.rooms.length - 1}>
                Salle suivante
              </button>
            </>
          )}
          <button type="button" onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen} aria-controls="visit-help">
            Aide
          </button>
          <Link to={galleryUrl}>Galerie 2D</Link>
        </div>
      </header>

      <div className="visit-stage">
        {!webgl || broken ? (
          <Fallback galleryUrl={galleryUrl} reason={!webgl ? 'webgl' : 'error'} />
        ) : (
          <ViewerBoundary fallback={<Fallback galleryUrl={galleryUrl} reason="error" />}>
            <Suspense fallback={<Loading label="Chargement de la salle 3D…" />}>
              <Viewer3D
                ref={viewer}
                room={room}
                arrivalSlot={arrivalSlot}
                paused={Boolean(openArtwork)}
                onSelect={select}
                onDoor={openDoor}
                onLockChange={setLocked}
                onContextLost={() => setBroken(true)}
              />
            </Suspense>
          </ViewerBoundary>
        )}
        {locked && <div className="crosshair" aria-hidden="true" />}
        {!preview && (
          <Suspense fallback={null}>
            <RoomChat exhibitionId={id} roomId={room.id} userId={user?.id ?? null} returnTo={`/expositions/${id}/visite`} />
          </Suspense>
        )}
        {webgl && !broken && items.length === 0 && <p className="visit-empty">Aucune œuvre n’est encore placée dans cette salle.</p>}
        {helpOpen && webgl && !broken && (
          <div className="visit-help" id="visit-help" role="note">
            <h2>Se déplacer</h2>
            <ul>
              <li>
                <kbd>↑</kbd> <kbd>↓</kbd> ou <kbd>Z</kbd> <kbd>S</kbd> (<kbd>W</kbd> <kbd>S</kbd>) : avancer, reculer
              </li>
              <li>
                <kbd>Q</kbd> <kbd>D</kbd> (<kbd>A</kbd> <kbd>D</kbd>) : pas de côté · <kbd>←</kbd> <kbd>→</kbd> : tourner
              </li>
              <li>Cliquez dans la salle pour regarder avec la souris ; <kbd>Échap</kbd> libère la souris.</li>
              <li>Cliquez sur un tableau pour ouvrir sa fiche, sur une porte pour changer de salle.</li>
              <li>Sur téléphone : boutons « Œuvre suivante » ou galerie 2D.</li>
            </ul>
            <button type="button" onClick={() => setHelpOpen(false)}>
              Compris
            </button>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <ArtworkDialog artwork={openArtwork} onClose={closeSheet} />
    </div>
  );
}
