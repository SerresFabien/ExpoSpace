import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LIMITS } from '@expospace/shared/limits.js';
import { ErrorBox, Field, Notice, fieldErrors } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDate } from '../lib/format.js';

export function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [profile, setProfile] = useState({ busy: false, error: null, saved: false });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwState, setPwState] = useState({ busy: false, error: null, saved: false });

  async function saveProfile(e) {
    e.preventDefault();
    setProfile({ busy: true, error: null, saved: false });
    try {
      const res = await api('/me', { method: 'PATCH', body: { displayName } });
      setUser(res.user);
      setDisplayName(res.user.displayName);
      setProfile({ busy: false, error: null, saved: true });
    } catch (error) {
      setProfile({ busy: false, error, saved: false });
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwState({ busy: true, error: null, saved: false });
    try {
      const res = await api('/me/password', { method: 'POST', body: pw });
      setUser(res.user);
      setPw({ currentPassword: '', newPassword: '' });
      setPwState({ busy: false, error: null, saved: true });
    } catch (error) {
      setPwState({ busy: false, error, saved: false });
    }
  }

  const pwFields = fieldErrors(pwState.error);

  return (
    <div className="narrow">
      <h1>Mon compte</h1>
      <p>
        Identifiant : <strong>{user.username}</strong> · inscrit le {formatDate(user.createdAt)}
      </p>

      <section className="panel">
        <h2>Nom affiché</h2>
        <form onSubmit={saveProfile} className="form">
          <Field label="Nom affiché" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={LIMITS.displayNameMax} required error={fieldErrors(profile.error).displayName} />
          <button type="submit" className="button-primary" disabled={profile.busy}>
            Enregistrer
          </button>
          {profile.saved && <p role="status">Nom enregistré.</p>}
        </form>
      </section>

      <section className="panel">
        <h2>Mot de passe</h2>
        <p className="muted">Changer de mot de passe ferme vos sessions ouvertes sur les autres appareils.</p>
        <ErrorBox error={pwState.error && !Object.keys(pwFields).length ? pwState.error : null} />
        <form onSubmit={savePassword} className="form">
          <Field label="Mot de passe actuel" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required error={pwFields.currentPassword} />
          <Field label="Nouveau mot de passe" type="password" hint={`Au moins ${LIMITS.passwordMin} caractères.`} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" required error={pwFields.newPassword} />
          <button type="submit" className="button-primary" disabled={pwState.busy}>
            Changer le mot de passe
          </button>
          {pwState.saved && <p role="status">Mot de passe changé.</p>}
        </form>
      </section>

      <Notice>
        Gardez votre code de récupération en lieu sûr : c’est le seul moyen de retrouver votre compte sans mot de passe.
      </Notice>

      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate('/');
        }}
      >
        Se déconnecter
      </button>
    </div>
  );
}
