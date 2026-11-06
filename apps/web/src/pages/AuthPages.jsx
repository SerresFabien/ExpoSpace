import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LIMITS } from '@expospace/shared/limits.js';
import { RecoveryCodeBox } from '../components/RecoveryCodeBox.jsx';
import { ErrorBox, Field, fieldErrors } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function safeReturn(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/studio';
}

export function RegisterPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const fields = fieldErrors(error);

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError({ message: 'Les deux mots de passe sont différents.', fields: { confirm: 'Les deux mots de passe sont différents.' } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/register', { method: 'POST', body: { username: form.username, displayName: form.displayName, password: form.password } });
      setDone(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="narrow">
        <h1>Compte créé</h1>
        <RecoveryCodeBox
          code={done.recoveryCode}
          username={done.user.username}
          doneLabel="Accéder à mes expositions"
          onDone={() => {
            signedIn(done);
            navigate('/studio');
          }}
        />
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Créer un compte</h1>
      <p>Aucune adresse e-mail n’est demandée. Un code de récupération vous sera remis à la fin.</p>
      <ErrorBox error={error && !Object.keys(fields).length ? error : null} title="Inscription impossible" />
      <form onSubmit={submit} noValidate className="form">
        <Field
          label="Identifiant de connexion"
          hint={`${LIMITS.usernameMin} à ${LIMITS.usernameMax} caractères : lettres minuscules, chiffres et _`}
          value={form.username}
          onChange={set('username')}
          autoComplete="username"
          required
          maxLength={LIMITS.usernameMax}
          error={fields.username}
        />
        <Field label="Nom affiché" hint="Visible sur vos expositions publiées." value={form.displayName} onChange={set('displayName')} required maxLength={LIMITS.displayNameMax} error={fields.displayName} />
        <Field
          label="Mot de passe"
          type="password"
          hint={`Au moins ${LIMITS.passwordMin} caractères. Une phrase facile à retenir convient très bien.`}
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          required
          maxLength={LIMITS.passwordMax}
          error={fields.password}
        />
        <Field label="Confirmer le mot de passe" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required error={fields.confirm} />
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <p>
        Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
      </p>
    </div>
  );
}

export function LoginPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signedIn(await api('/auth/login', { method: 'POST', body: form }));
      navigate(safeReturn(params.get('retour')), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Connexion</h1>
      <ErrorBox error={error} title="Connexion impossible" />
      <form onSubmit={submit} className="form">
        <Field label="Identifiant" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" required />
        <Field label="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p>
        <Link to="/recuperation">Mot de passe oublié ?</Link> · <Link to="/inscription">Créer un compte</Link>
      </p>
    </div>
  );
}

export function RecoverPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', recoveryCode: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const fields = fieldErrors(error);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await api('/auth/recover', { method: 'POST', body: form }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="narrow">
        <h1>Mot de passe remplacé</h1>
        <p>Vos autres sessions ont été fermées et l’ancien code ne fonctionne plus. Voici votre nouveau code :</p>
        <RecoveryCodeBox
          code={done.recoveryCode}
          username={done.user.username}
          doneLabel="Accéder à mes expositions"
          onDone={() => {
            signedIn(done);
            navigate('/studio');
          }}
        />
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Récupérer mon compte</h1>
      <p>Saisissez le code de récupération reçu à l’inscription (ou lors de la dernière récupération). Sans ce code ni le mot de passe, aucune récupération automatique n’est possible.</p>
      <ErrorBox error={error && !Object.keys(fields).length ? error : null} title="Récupération impossible" />
      <form onSubmit={submit} noValidate className="form">
        <Field label="Identifiant" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" required />
        <Field label="Code de récupération" hint="Format XXXXX-XXXXX-…, majuscules ou minuscules." value={form.recoveryCode} onChange={(e) => setForm({ ...form, recoveryCode: e.target.value })} autoComplete="off" spellCheck="false" required error={fields.recoveryCode} />
        <Field label="Nouveau mot de passe" type="password" hint={`Au moins ${LIMITS.passwordMin} caractères.`} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" required error={fields.newPassword} />
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? 'Vérification…' : 'Remplacer le mot de passe'}
        </button>
      </form>
    </div>
  );
}
