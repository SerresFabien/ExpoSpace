// Point d'entrée et routes.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { AuthProvider, RequireAuth } from './lib/auth.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { LoginPage, RecoverPage, RegisterPage } from './pages/AuthPages.jsx';
import { CatalogPage } from './pages/CatalogPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ExhibitionPage } from './pages/ExhibitionPage.jsx';
import { GalleryPage } from './pages/GalleryPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { VisitPage } from './pages/VisitPage.jsx';
import { StudioPage } from './studio/StudioPage.jsx';
import './styles.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'connexion', element: <LoginPage /> },
      { path: 'inscription', element: <RegisterPage /> },
      { path: 'recuperation', element: <RecoverPage /> },
      { path: 'expositions/:id', element: <ExhibitionPage /> },
      { path: 'expositions/:id/galerie', element: <GalleryPage /> },
      { path: 'compte', element: <RequireAuth><AccountPage /></RequireAuth> },
      { path: 'studio', element: <RequireAuth><DashboardPage /></RequireAuth> },
      { path: 'studio/:id', element: <RequireAuth><StudioPage /></RequireAuth> },
      { path: 'studio/:id/apercu', element: <RequireAuth><GalleryPage preview /></RequireAuth> },
      { path: 'admin', element: <RequireAuth admin><AdminPage /></RequireAuth> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: 'expositions/:id/visite', element: <VisitPage /> },
  { path: 'studio/:id/visite', element: <RequireAuth><VisitPage preview /></RequireAuth> },
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
