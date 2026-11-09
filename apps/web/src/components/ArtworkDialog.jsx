// Fiche d'une œuvre.
import { Modal } from './ui.jsx';

export function ArtworkDialog({ artwork, onClose }) {
  return (
    <Modal open={Boolean(artwork)} onClose={onClose} title={artwork?.title || 'Œuvre sans titre'} wide>
      {artwork && (
        <div className="artwork-sheet">
          <img src={artwork.imageUrl} alt={artwork.altText || ''} className="artwork-sheet-image" />
          <div className="artwork-sheet-text">
            {artwork.artistName && <p className="artwork-artist">{artwork.artistName}</p>}
            {artwork.description ? <p className="artwork-description">{artwork.description}</p> : <p className="muted">Pas de description.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
