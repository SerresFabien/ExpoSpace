// Galerie 2D, alternative accessible à la 3D.
import { useState } from 'react';
import { WALL_LABELS, getSlot } from '@expospace/shared/roomLayout.js';
import { ArtworkDialog } from '../components/ArtworkDialog.jsx';

export function Gallery2D({ model }) {
  const [open, setOpen] = useState(null);
  const multiRoom = model.rooms.length > 1;
  return (
    <>
      {model.rooms.map((room) => (
        <section key={room.id} className="gallery-room" aria-labelledby={`salle-${room.id}`}>
          <h2 id={`salle-${room.id}`}>{multiRoom ? `Salle ${room.position} - ${room.name}` : room.name}</h2>
          {room.items.length === 0 ? (
            <p className="empty">Aucune œuvre dans cette salle.</p>
          ) : (
            <ol className="gallery-grid">
              {room.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="gallery-item" onClick={() => setOpen(item)}>
                    <img src={item.thumbnailUrl} alt={item.altText || ''} loading="lazy" />
                    <span className="gallery-title">{item.title || 'Sans titre'}</span>
                    {item.artistName && <span className="gallery-artist">{item.artistName}</span>}
                    <span className="gallery-slot">
                      {WALL_LABELS[getSlot(item.slotCode)?.wall]} · place {item.slotCode}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
      <ArtworkDialog artwork={open} onClose={() => setOpen(null)} />
    </>
  );
}
