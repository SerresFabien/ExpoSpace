// Code de récupération, affiché une seule fois.
import { useState } from 'react';

export function RecoveryCodeBox({ code, username, onDone, doneLabel = 'Continuer' }) {
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const text = `ExpoSpace - code de récupération\nIdentifiant : ${username}\nCode : ${code}\n\nCe code permet de choisir un nouveau mot de passe si vous oubliez le vôtre.\nIl ne fonctionne qu'une fois. Conservez-le en lieu sûr.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `expospace-code-recuperation-${username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="recovery-box" aria-labelledby="recovery-title">
      <h2 id="recovery-title">Votre code de récupération</h2>
      <p>
        ExpoSpace n’utilise pas d’e-mail : <strong>ce code est le seul moyen de retrouver votre compte</strong> si vous oubliez votre mot de passe.
        Il ne sera plus jamais affiché.
      </p>
      <p className="recovery-code" data-testid="recovery-code">
        {code}
      </p>
      <div className="actions">
        <button type="button" onClick={copy}>
          {copied ? 'Copié ✓' : 'Copier le code'}
        </button>
        <button type="button" onClick={download}>
          Télécharger (.txt)
        </button>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} /> J’ai conservé ce code en lieu sûr.
      </label>
      <button type="button" className="button-primary" disabled={!kept} onClick={onDone}>
        {doneLabel}
      </button>
    </section>
  );
}
