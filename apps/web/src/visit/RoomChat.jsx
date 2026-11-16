// Présence et discussion de salle (facultatif).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { connectRealtime } from '../lib/realtime.js';

const MAX_MESSAGES = 50;
const MAX_LENGTH = 300;

export default function RoomChat({ exhibitionId, roomId, userId, returnTo }) {
  const [status, setStatus] = useState('connecting');
  const [count, setCount] = useState(null);
  const [canChat, setCanChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const client = useRef(null);
  const currentRoom = useRef(roomId);
  currentRoom.current = roomId;

  // Reconnexion quand l'utilisateur change.
  useEffect(() => {
    const { socket, app } = connectRealtime();
    client.current = app;
    app.on('presence', (value) => value.roomId === currentRoom.current && setCount(value.count));
    const stopChat = app.service('chat').on('send', (message) => {
      if (message.roomId === currentRoom.current) setMessages((list) => [...list, message].slice(-MAX_MESSAGES));
    });
    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('connecting'));
    // Indisponible au premier échec ; Socket.IO continue d'essayer.
    socket.on('connect_error', () => setStatus('offline'));
    // Délai maximal de connexion.
    const timer = setTimeout(() => !socket.connected && setStatus('offline'), 8000);
    return () => {
      clearTimeout(timer);
      stopChat();
      socket.disconnect();
      client.current = null;
    };
  }, [userId]);

  useEffect(() => {
    setMessages([]);
    setCount(null);
    setError(null);
    if (status !== 'online') return;
    client.current
      ?.service('presence')
      .join(exhibitionId, roomId)
      .then((res) => {
        if (res.roomId !== currentRoom.current) return;
        setCount(res.count);
        setCanChat(res.canChat);
      })
      .catch(() => setStatus('offline'));
  }, [exhibitionId, roomId, status]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await client.current.service('chat').send(text);
      setText('');
    } catch (err) {
      setError(err?.message ?? 'Message non envoyé.');
    } finally {
      setSending(false);
    }
  }

  if (status === 'offline') {
    return (
      <aside className="room-chat" aria-label="Discussion de la salle">
        <p className="room-chat-head">Discussion indisponible</p>
      </aside>
    );
  }

  const people = count === null ? '…' : count > 1 ? `${count} visiteurs dans cette salle` : 'Vous êtes la seule personne dans cette salle';
  return (
    <aside className="room-chat" aria-label="Discussion de la salle">
      <div className="room-chat-head">
        <span data-testid="presence">{people}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="room-chat-body">
          Discussion{messages.length ? ` (${messages.length})` : ''}
        </button>
      </div>
      <div id="room-chat-body" hidden={!open}>
        <ol className="room-chat-messages" aria-live="polite" aria-label="Messages de la salle">
          {messages.length === 0 && <li className="muted">Les messages ne sont pas conservés.</li>}
          {messages.map((m) => (
            <li key={m.id}>
              <strong>{m.author}</strong> {m.text}
            </li>
          ))}
        </ol>
        {canChat ? (
          <form onSubmit={send} className="room-chat-form">
            <label htmlFor="room-chat-input" className="sr-only">
              Votre message
            </label>
            <input id="room-chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_LENGTH} autoComplete="off" placeholder="Votre message" />
            <button type="submit" disabled={sending || !text.trim()}>
              Envoyer
            </button>
          </form>
        ) : (
          <p className="small">
            <Link to={`/connexion?retour=${encodeURIComponent(returnTo)}`}>Connectez-vous</Link> pour écrire.
          </p>
        )}
        {error && (
          <p className="room-chat-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
