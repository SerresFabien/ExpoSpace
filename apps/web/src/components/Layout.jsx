// Mise en page (pied de page dans index.html).
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.jsx';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" /> ExpoSpace
          </Link>
          <nav aria-label="Navigation principale">
            <ul className="nav-list">
              <li>
                <NavLink to="/" end>
                  Catalogue
                </NavLink>
              </li>
              {user ? (
                <>
                  <li>
                    <NavLink to="/studio">Mes expositions</NavLink>
                  </li>
                  {user.role === 'ADMIN' && (
                    <li>
                      <NavLink to="/admin">Administration</NavLink>
                    </li>
                  )}
                  <li>
                    <NavLink to="/compte">{user.displayName}</NavLink>
                  </li>
                  <li>
                    <button type="button" className="button-link" onClick={handleLogout}>
                      Déconnexion
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <NavLink to="/connexion">Connexion</NavLink>
                  </li>
                  <li>
                    <NavLink to="/inscription" className="nav-cta">
                      Créer un compte
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </header>
      <main id="contenu" className="container main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
