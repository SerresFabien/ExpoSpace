// Édition d'une exposition (onglets, ETag partagé).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { ConfirmDialog, ErrorBox, Loading, Notice, StatusBadge } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { ArtworksTab } from './ArtworksTab.jsx';
import { InfoTab } from './InfoTab.jsx';
import { PublishTab } from './PublishTab.jsx';
import { RoomTab } from './RoomTab.jsx';

const TABS = [
  { key: 'oeuvres', label: 'Œuvres' },
  { key: 'salle', label: 'Salle et accrochage' },
  { key: 'infos', label: 'Informations' },
  { key: 'publication', label: 'Publication' },
];

export function StudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('onglet')) ? params.get('onglet') : 'oeuvres';

  const [exhibition, setExhibition] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState({});
  const [generation, setGeneration] = useState(0);
  const latest = useRef(null);
  const leaving = useRef(false);

  const apply = useCallback((ex) => {
    latest.current = ex;
    setExhibition(ex);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api(`/me/exhibitions/${id}`);
      apply(res.exhibition);
      setConflict(false);
      setDirty({});
      setGeneration((g) => g + 1);
    } catch (err) {
      setLoadError(err);
    }
  }, [id, apply]);

  useEffect(() => {
    load();
  }, [load]);

  // Dernier ETag ; un 412 est affiché sans nouvel essai.
  const write = useCallback(
    async (path, { method = 'POST', body } = {}) => {
      try {
        const res = await api(`/me/exhibitions/${id}${path}`, { method, body, etag: latest.current.etag });
        if (res?.exhibition) apply(res.exhibition);
        return res;
      } catch (err) {
        if (err.status === 412) setConflict(true);
        throw err;
      }
    },
    [id, apply],
  );

  const markDirty = useCallback((key, value) => setDirty((d) => (Boolean(d[key]) === value ? d : { ...d, [key]: value })), []);
  const anyDirty = Object.values(dirty).some(Boolean);
  // Onglet modifié si l'une de ses clés l'est.
  const tabDirty = (key) => Object.entries(dirty).some(([k, v]) => v && (k === key || k.startsWith(`${key}-`)));
  const dirtyTabs = TABS.filter((t) => tabDirty(t.key)).map((t) => t.label);

  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);
  // Alerte avant de quitter sans enregistrer.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => anyDirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  if (loadError?.status === 404) {
    return (
      <div className="narrow">
        <h1>Exposition introuvable</h1>
        <p>Elle n’existe pas ou ne vous appartient pas.</p>
        <Link to="/studio">Retour à mes expositions</Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <ErrorBox error={loadError} title="Chargement impossible">
        <button type="button" onClick={load}>
          Réessayer
        </button>
      </ErrorBox>
    );
  }
  if (!exhibition) return <Loading />;

  const locked = exhibition.status === 'PUBLISHED';
  const shared = { exhibition, write, locked, markDirty, apply, latest, setConflict };

  return (
    <div className="studio">
      <p>
        <Link to="/studio">← Mes expositions</Link>
      </p>
      <div className="studio-header">
        <div>
          <h1>{exhibition.title}</h1>
          <p>
            <StatusBadge status={exhibition.status} suspended={exhibition.suspended} /> <span className="muted">version {exhibition.version}</span>
          </p>
        </div>
        <div className="actions">
          <Link to={`/studio/${id}/visite`} className="button">
            Aperçu 3D
          </Link>
          <Link to={`/studio/${id}/apercu`} className="button">
            Aperçu 2D
          </Link>
          {locked && !exhibition.suspended && (
            <Link to={`/expositions/${id}`} className="button">
              Page publique
            </Link>
          )}
        </div>
      </div>

      {conflict && (
        <div className="notice notice-error" role="alert">
          <strong>Cette exposition a été modifiée ailleurs</strong> (autre onglet ou appareil). Vos changements restent affichés mais n’ont pas été enregistrés.
          Notez-les, rechargez la dernière version, puis réappliquez-les.
          <div className="actions">
            <button type="button" className="button-primary" onClick={load}>
              Recharger la dernière version
            </button>
          </div>
        </div>
      )}
      {exhibition.suspended && (
        <Notice kind="error" role="alert">
          Cette exposition a été masquée par l’équipe : elle n’est plus visible publiquement et ne peut pas être republiée.
        </Notice>
      )}
      {locked && !exhibition.suspended && (
        <Notice kind="warning">
          Exposition publiée : elle est verrouillée. Pour la modifier, dépubliez-la dans l’onglet <button type="button" className="button-link" onClick={() => setParams({ onglet: 'publication' })}>Publication</button> ;
          le lien public sera indisponible pendant vos modifications.
        </Notice>
      )}

      <div className="tabs" role="tablist" aria-label="Sections de l’exposition">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            className={tab === t.key ? 'tab tab-active' : 'tab'}
            onClick={() => setParams({ onglet: t.key }, { replace: true })}
          >
            {t.label}
            {tabDirty(t.key) ? ' •' : ''}
          </button>
        ))}
      </div>

      <div key={generation}>
        <section role="tabpanel" id="panel-oeuvres" aria-labelledby="tab-oeuvres" hidden={tab !== 'oeuvres'}>
          <ArtworksTab {...shared} />
        </section>
        <section role="tabpanel" id="panel-salle" aria-labelledby="tab-salle" hidden={tab !== 'salle'}>
          <RoomTab {...shared} />
        </section>
        <section role="tabpanel" id="panel-infos" aria-labelledby="tab-infos" hidden={tab !== 'infos'}>
          <InfoTab {...shared} />
        </section>
        <section role="tabpanel" id="panel-publication" aria-labelledby="tab-publication" hidden={tab !== 'publication'}>
          <PublishTab {...shared} anyDirty={anyDirty} dirtyTabs={dirtyTabs} onDeleted={() => {
              leaving.current = true;
              navigate('/studio');
            }} />
        </section>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Quitter sans enregistrer ?"
        confirmLabel="Quitter sans enregistrer"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>Certaines modifications n’ont pas été enregistrées. Elles seront perdues si vous quittez cette page.</p>
      </ConfirmDialog>
    </div>
  );
}
