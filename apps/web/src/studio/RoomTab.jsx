// Onglet Salle : accrochage des œuvres et des portes.
import { useEffect, useId, useMemo, useState } from 'react';
import { LIMITS, WALL_COLORS } from '@expospace/shared/limits.js';
import { SLOTS, WALL_LABELS, getSlot } from '@expospace/shared/roomLayout.js';
import { ConfirmDialog, ErrorBox, Field, fieldErrors } from '../components/ui.jsx';

const PLAN_CELL = {
  N1: [1, 2], N2: [1, 3], N3: [1, 4],
  E1: [2, 5], E2: [3, 5], E3: [4, 5],
  S1: [5, 4], S2: [5, 3], S3: [5, 2],
  W1: [4, 1], W2: [3, 1], W3: [2, 1],
};

const key = (p) => `${p.roomId}|${p.artworkId}|${p.slotCode}`;
const samePlacements = (a, b) => a.length === b.length && a.map(key).sort().join() === b.map(key).sort().join();
const doorKey = (d) => `${d.roomId}|${d.slotCode}|${d.targetRoomId}`;
const sameDoors = (a, b) => a.length === b.length && a.map(doorKey).sort().join() === b.map(doorKey).sort().join();
// Choix « porte » dans la liste.
const DOOR = 'porte';

export function RoomTab({ exhibition, write, locked, markDirty }) {
  const [roomId, setRoomId] = useState(exhibition.rooms[0].id);
  const room = exhibition.rooms.find((r) => r.id === roomId) ?? exhibition.rooms[0];
  const [draft, setDraft] = useState(null);
  const [doorDraft, setDoorDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [choice, setChoice] = useState('');
  const [doorTarget, setDoorTarget] = useState('');
  const [save, setSave] = useState({ state: 'idle', error: null });
  const groupName = useId();

  // Brouillon des portes réinitialisé quand les salles changent.
  const roomKey = exhibition.rooms.map((r) => r.id).join();
  useEffect(() => setDoorDraft(null), [roomKey]);

  const placements = draft ?? exhibition.placements;
  const doors = doorDraft ?? exhibition.doors;
  const dirty = (draft !== null && !samePlacements(draft, exhibition.placements)) || (doorDraft !== null && !sameDoors(doorDraft, exhibition.doors));
  useEffect(() => markDirty('salle', dirty), [dirty, markDirty]);

  const artworks = useMemo(() => new Map(exhibition.artworks.map((a) => [a.id, a])), [exhibition.artworks]);
  useEffect(() => setDraft((d) => d && d.filter((p) => artworks.has(p.artworkId))), [artworks]);
  const inRoom = new Map(placements.filter((p) => p.roomId === room.id).map((p) => [p.slotCode, p]));
  const doorsInRoom = new Map(doors.filter((d) => d.roomId === room.id).map((d) => [d.slotCode, d]));
  const byArtwork = new Map(placements.map((p) => [p.artworkId, p]));
  const occupant = selected ? artworks.get(inRoom.get(selected)?.artworkId) : null;
  const selectedDoor = selected ? doorsInRoom.get(selected) : null;
  const otherRooms = exhibition.rooms.filter((r) => r.id !== room.id);

  const roomName = (id) => {
    const r = exhibition.rooms.find((x) => x.id === id);
    return r ? r.name : '';
  };

  function change(nextPlacements, nextDoors = doorDraft) {
    setDraft(nextPlacements);
    setDoorDraft(nextDoors);
    setSave({ state: 'idle', error: null });
  }

  function selectSlot(code) {
    const door = doorsInRoom.get(code);
    setSelected(code);
    setChoice(door ? DOOR : (inRoom.get(code)?.artworkId ?? ''));
    setDoorTarget(door?.targetRoomId ?? otherRooms[0]?.id ?? '');
  }

  // Une place contient une œuvre ou une porte.
  const freeSlot = () => ({
    placements: placements.filter((p) => !(p.roomId === room.id && p.slotCode === selected)),
    doors: doors.filter((d) => !(d.roomId === room.id && d.slotCode === selected)),
  });

  function place() {
    if (!selected || !choice) return;
    const free = freeSlot();
    if (choice === DOOR) {
      change(free.placements, [...free.doors, { roomId: room.id, slotCode: selected, targetRoomId: doorTarget }]);
      return;
    }
    change([...free.placements.filter((p) => p.artworkId !== choice), { roomId: room.id, artworkId: choice, slotCode: selected }], free.doors);
  }

  function removeFromRoom() {
    const free = freeSlot();
    change(free.placements, free.doors);
    setChoice('');
  }

  async function saveLayout() {
    setSave({ state: 'saving', error: null });
    try {
      await write('/placements', { method: 'PUT', body: { placements, doors } });
      setDraft(null);
      setDoorDraft(null);
      setSave({ state: 'saved', error: null });
    } catch (error) {
      setSave({ state: 'error', error });
    }
  }

  const [rooms, setRooms] = useState({ busy: false, error: null, confirm: false });
  const roomsBlocked = locked || dirty || rooms.busy;

  const [addedNotice, setAddedNotice] = useState('');

  async function addRoom() {
    setRooms({ busy: true, error: null, confirm: false });
    try {
      const res = await write('/rooms', { body: {} });
      const added = res.exhibition.rooms.at(-1);
      setRoomId(added.id);
      setSelected(null);
      setRooms({ busy: false, error: null, confirm: false });
      setAddedNotice(`« ${added.name} » ajoutée. Pour y accéder, posez une porte qui y mène dans une autre salle (et une porte pour en revenir).`);
    } catch (error) {
      setRooms({ busy: false, error, confirm: false });
    }
  }

  async function deleteRoom() {
    setRooms({ busy: true, error: null, confirm: true });
    try {
      const res = await write(`/rooms/${room.id}`, { method: 'DELETE' });
      setRoomId(res.exhibition.rooms[0].id);
      setSelected(null);
      setRooms({ busy: false, error: null, confirm: false });
    } catch (error) {
      setRooms({ busy: false, error, confirm: false });
    }
  }

  const status = save.state === 'saving' ? 'Enregistrement en cours…' : save.state === 'error' ? 'Échec de l’enregistrement' : dirty ? 'Modifications non enregistrées' : save.state === 'saved' ? 'Enregistré ✓' : 'Aucune modification';

  return (
    <div className="tab-content">
      <div className="rooms-bar">
        {exhibition.rooms.length > 1 && (
          <div className="field">
            <label htmlFor="room-select">Salle affichée</label>
            <select
              id="room-select"
              value={room.id}
              onChange={(e) => {
                setRoomId(e.target.value);
                setSelected(null);
                setAddedNotice('');
              }}
            >
              {exhibition.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Salle {r.position} - {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={addRoom} disabled={roomsBlocked || exhibition.rooms.length >= LIMITS.roomsPerExhibition}>
            Ajouter une salle
          </button>
          {exhibition.rooms.length > 1 && (
            <button type="button" className="button-danger-outline" onClick={() => setRooms({ busy: false, error: null, confirm: true })} disabled={roomsBlocked}>
              Supprimer cette salle
            </button>
          )}
        </div>
        <p className="muted small">
          {dirty && !locked
            ? 'Enregistrez d’abord la disposition pour ajouter ou supprimer une salle.'
            : `Jusqu’à ${LIMITS.roomsPerExhibition} salles, visitées dans l’ordre.`}
        </p>
      </div>
      <ErrorBox error={rooms.confirm ? null : rooms.error} title="Action impossible sur les salles" />
      {addedNotice && (
        <p className="notice notice-success" role="status">
          {addedNotice}
        </p>
      )}
      {exhibition.rooms.length > 1 && (
        <div className="doors-summary" role="note">
          <strong>Portes de « {room.name} » :</strong>
          {doorsInRoom.size === 0 ? (
            <p>aucune pour l’instant.</p>
          ) : (
            <ul>
              {[...doorsInRoom.values()].map((d) => (
                <li key={d.slotCode}>
                  {d.slotCode} → « {roomName(d.targetRoomId)} »
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Pour poser une porte : cliquez sur une place du plan, choisissez « Une porte » et la salle où elle mène, puis « Placer ici ».</p>
        </div>
      )}

      <RoomSettings key={room.id} room={room} write={write} locked={locked} markDirty={markDirty} />

      <ConfirmDialog
        open={rooms.confirm}
        title={`Supprimer « ${room.name} » ?`}
        confirmLabel="Supprimer la salle"
        danger
        busy={rooms.busy}
        onConfirm={deleteRoom}
        onCancel={() => setRooms({ busy: false, error: null, confirm: false })}
      >
        <p>Les œuvres accrochées dans cette salle seront décrochées ; leurs fiches et leurs images sont conservées. Ses portes et celles qui y mènent seront retirées.</p>
        <ErrorBox error={rooms.error} />
      </ConfirmDialog>

      <div className="room-editor">
        <div className="room-plan" aria-label={`Plan de la salle ${room.name}, vue de dessus, nord en haut`} role="group">
          {SLOTS.map((slot) => {
            const p = inRoom.get(slot.code);
            const art = p ? artworks.get(p.artworkId) : null;
            const door = doorsInRoom.get(slot.code);
            const [row, col] = PLAN_CELL[slot.code];
            return (
              <button
                key={slot.code}
                type="button"
                className={`slot${art ? ' slot-filled' : ''}${door ? ' slot-door' : ''}${selected === slot.code ? ' slot-selected' : ''}`}
                style={{ gridRow: row, gridColumn: col }}
                aria-pressed={selected === slot.code}
                aria-label={`Place ${slot.code}, ${WALL_LABELS[slot.wall].toLowerCase()} : ${
                  door ? `porte vers ${roomName(door.targetRoomId)}` : art ? art.title || 'œuvre sans titre' : 'libre'
                }`}
                onClick={() => selectSlot(slot.code)}
              >
                {door ? (
                  <span className="slot-door-label">Porte → {roomName(door.targetRoomId)}</span>
                ) : art ? (
                  <img src={art.thumbnailUrl} alt="" />
                ) : (
                  <span className="slot-empty">Libre</span>
                )}
                <span className="slot-code">{slot.code}</span>
              </button>
            );
          })}
          <div className="room-floor" style={{ gridRow: '2 / 5', gridColumn: '2 / 5' }} aria-hidden="true">
            <span className="room-wall-label room-wall-n">Nord</span>
            <span className="room-entry">▲ Entrée du visiteur</span>
          </div>
        </div>

        <div className="slot-panel">
          {!selected ? (
            <p className="muted">
              Choisissez une place sur le plan (cliquez ou utilisez Tab puis Entrée) pour y accrocher une œuvre
              {exhibition.rooms.length > 1 ? ' ou une porte' : ''}.
            </p>
          ) : (
            <>
              <h3>
                Place {selected} - {WALL_LABELS[getSlot(selected).wall]}
              </h3>
              <p>
                {selectedDoor ? (
                  <>
                    Porte vers <strong>{roomName(selectedDoor.targetRoomId)}</strong>.
                  </>
                ) : occupant ? (
                  <>
                    Occupée par : <strong>{occupant.title || 'œuvre sans titre'}</strong>
                  </>
                ) : (
                  'Place libre.'
                )}
              </p>
              {exhibition.artworks.length === 0 && otherRooms.length === 0 ? (
                <p className="notice notice-info">Importez d’abord des images dans l’onglet « Œuvres ».</p>
              ) : (
                <fieldset disabled={locked}>
                  <legend>À accrocher ici</legend>
                  <ul className="choice-list">
                    {otherRooms.length > 0 && (
                      <li>
                        <label className="choice">
                          <input type="radio" name={groupName} value={DOOR} checked={choice === DOOR} onChange={() => setChoice(DOOR)} />
                          <span className="choice-door" aria-hidden="true" />
                          <span>Une porte</span>
                        </label>
                        {choice === DOOR && (
                          <div className="field door-target">
                            <label htmlFor="door-target">Elle mène à</label>
                            <select id="door-target" value={doorTarget} onChange={(e) => setDoorTarget(e.target.value)}>
                              {otherRooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  Salle {r.position} - {r.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </li>
                    )}
                    {exhibition.artworks.map((art) => {
                      const where = byArtwork.get(art.id);
                      const elsewhere = where && !(where.roomId === room.id && where.slotCode === selected);
                      return (
                        <li key={art.id}>
                          <label className="choice">
                            <input type="radio" name={groupName} value={art.id} checked={choice === art.id} onChange={() => setChoice(art.id)} />
                            <img src={art.thumbnailUrl} alt="" />
                            <span>
                              {art.title || <em>Sans titre</em>}
                              {elsewhere && (
                                <span className="muted small">
                                  {' '}
                                  (actuellement en {where.slotCode}
                                  {exhibition.rooms.length > 1 && where.roomId !== room.id ? `, ${roomName(where.roomId)}` : ''} : sera déplacée)
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="actions">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={place}
                      disabled={!choice || (choice === DOOR ? !doorTarget || selectedDoor?.targetRoomId === doorTarget : inRoom.get(selected)?.artworkId === choice)}
                    >
                      Placer ici
                    </button>
                    <button type="button" onClick={removeFromRoom} disabled={!occupant && !selectedDoor}>
                      Retirer de la salle
                    </button>
                  </div>
                  <p className="muted small">« Retirer » libère la place sans supprimer la fiche ni l’image.</p>
                </fieldset>
              )}
            </>
          )}
        </div>
      </div>

      <div className="save-bar">
        <p className={`save-status save-${dirty ? 'dirty' : save.state}`} role="status" aria-live="polite">
          {status}
        </p>
        <div className="actions">
          <button type="button" onClick={() => change(null, null)} disabled={!dirty || save.state === 'saving'}>
            Annuler les changements
          </button>
          <button type="button" className="button-primary" onClick={saveLayout} disabled={locked || !dirty || save.state === 'saving'}>
            Enregistrer la disposition
          </button>
        </div>
      </div>
      <ErrorBox error={save.error} title="La disposition n’a pas été enregistrée">
        {Object.values(fieldErrors(save.error)).length > 0 && (
          <ul>
            {Object.values(fieldErrors(save.error)).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </ErrorBox>
    </div>
  );
}

function RoomSettings({ room, write, locked, markDirty }) {
  const [form, setForm] = useState({ name: room.name, wallColor: room.wallColor });
  const [state, setState] = useState({ busy: false, error: null, saved: false });
  const dirty = form.name !== room.name || form.wallColor !== room.wallColor;
  useEffect(() => markDirty('salle-reglages', dirty), [dirty, markDirty]);
  // Marque « modifié » retirée au démontage.
  useEffect(() => () => markDirty('salle-reglages', false), [markDirty]);
  useEffect(() => {
    if (!dirty) setForm({ name: room.name, wallColor: room.wallColor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.name, room.wallColor]);

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: null, saved: false });
    try {
      await write(`/rooms/${room.id}`, { method: 'PATCH', body: form });
      setState({ busy: false, error: null, saved: true });
    } catch (error) {
      setState({ busy: false, error, saved: false });
    }
  }

  const fields = fieldErrors(state.error);
  return (
    <form onSubmit={submit} className="panel room-settings">
      <fieldset disabled={locked}>
        <legend>Salle</legend>
        <Field label="Nom de la salle" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={LIMITS.roomNameMax} error={fields.name} />
        <div className="field">
          <span className="field-label" id="wall-color-label">
            Couleur des murs
          </span>
          <div className="swatches" role="radiogroup" aria-labelledby="wall-color-label">
            {WALL_COLORS.map((c) => (
              <label key={c.key} className="swatch">
                <input type="radio" name="wallColor" value={c.key} checked={form.wallColor === c.key} onChange={() => setForm({ ...form, wallColor: c.key })} />
                <span className="swatch-color" style={{ background: c.hex }} aria-hidden="true" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" disabled={!dirty || state.busy}>
          Enregistrer la salle
        </button>{' '}
        {state.saved && !dirty && <span role="status">Salle enregistrée.</span>}
      </fieldset>
      <ErrorBox error={state.error && !Object.keys(fields).length ? state.error : null} />
    </form>
  );
}
