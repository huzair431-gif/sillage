import { createContext, lazy, Suspense, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Command,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { api, ApiError, setCsrf, type Overview, type User } from './api';
import { Button, Dialog, ErrorState, Loading, Logo } from './ui';
import { AuthContext, useUser } from './context';
import { AuthPage } from './AuthPage';
import { Dashboard, SubjectsPage, SubjectPage, ChapterPage } from './LibraryPages';
const ImportPage = lazy(() => import('./ImportPage'));
const QuizPage = lazy(() => import('./QuizPage'));
const Statistics = lazy(() =>
  import('./StatisticsSettings').then((m) => ({ default: m.Statistics })),
);
const SettingsPage = lazy(() =>
  import('./StatisticsSettings').then((m) => ({ default: m.SettingsPage })),
);
const HistoryPage = lazy(() =>
  import('./StatisticsSettings').then((m) => ({ default: m.HistoryPage })),
);
export default function App() {
  const location = useLocation();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me'),
    retry: false,
    staleTime: 300000,
  });
  useEffect(() => {
    const fn = () => qc.setQueryData(['me'], null);
    window.addEventListener('sillage:unauthorized', fn);
    return () => window.removeEventListener('sillage:unauthorized', fn);
  }, [qc]);
  useEffect(() => {
    const u = me.data;
    if (u) {
      setCsrf(u.csrf);
      const p = u.preferences;
      const dark =
        p.theme === 'dark' ||
        (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.reduced = p.reducedMotion ? 'true' : 'false';
      const media = matchMedia('(prefers-color-scheme: dark)');
      const change = () => {
        if (p.theme === 'system')
          document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
      };
      media.addEventListener('change', change);
      return () => media.removeEventListener('change', change);
    }
  }, [me.data]);
  if (me.isPending) return <Loading />;
  if (me.isError && !(me.error instanceof ApiError && me.error.status === 401))
    return <ErrorState error={me.error} retry={() => me.refetch()} />;
  if (!me.data) return <AuthPage />;
  return (
    <AuthContext.Provider value={me.data}>
      <MotionConfig reducedMotion={me.data.preferences.reducedMotion ? 'always' : 'user'}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/quiz/:id" element={<QuizPage key={location.pathname} />} />
            <Route path="/chapters/:id/import" element={<ImportPage />} />
            <Route path="*" element={<Shell />} />
          </Routes>
        </Suspense>
      </MotionConfig>
    </AuthContext.Provider>
  );
}
function Shell() {
  const user = useUser();
  const qc = useQueryClient();
  const location = useLocation();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false);
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      setCsrf('');
      await qc.cancelQueries();
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
  useEffect(() => setMobile(false), [location.pathname]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  const nav = [
    { to: '/', label: 'Vue d’ensemble', icon: Home },
    { to: '/subjects', label: 'Mes matières', icon: BookOpen },
    { to: '/statistics', label: 'Ma progression', icon: BarChart3 },
    { to: '/history', label: 'Mes sessions', icon: Sparkles },
  ];
  const menu = (
    <>
      <div className="sidebar-brand">
        <Link to="/" aria-label="Sillage, accueil">
          <Logo />
        </Link>
      </div>
      <button className="search-trigger" onClick={() => setSearch(true)}>
        <Search size={16} />
        <span>Rechercher</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className="nav-label">MON APPRENTISSAGE</div>
      <nav aria-label="Navigation principale">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <n.icon size={18} strokeWidth={1.7} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="tiny-trail">〰</span>
          <p>
            La régularité dessine
            <br />
            le chemin.
          </p>
        </div>
        <NavLink className="settings-link" to="/settings">
          <Settings size={18} />
          Paramètres
        </NavLink>
        <div className="user-row">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>Espace personnel</small>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout.mutate()}
            loading={logout.isPending}
            aria-label="Se déconnecter"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <aside className="sidebar">{menu}</aside>
      <div className="workspace">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Ouvrir la navigation"
          >
            <Menu size={21} />
          </Button>
          <div className="workspace-crumb">
            <LayoutGrid size={15} />
            <span>Espace personnel</span>
            <ChevronRight size={13} />
            <span>
              {location.pathname.startsWith('/subjects')
                ? 'Matières'
                : location.pathname.startsWith('/chapters')
                  ? 'Chapitre'
                  : location.pathname === '/statistics'
                    ? 'Progression'
                    : location.pathname === '/settings'
                      ? 'Paramètres'
                      : location.pathname === '/history'
                        ? 'Sessions'
                        : 'Vue d’ensemble'}
            </span>
          </div>
          <div className="topbar-date">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </div>
          <Button
            className="mobile-search"
            variant="ghost"
            size="icon"
            aria-label="Rechercher"
            onClick={() => setSearch(true)}
          >
            <Search size={18} />
          </Button>
        </header>
        <main id="main" className="main-content">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/subjects/:id" element={<SubjectPage />} />
              <Route path="/chapters/:id" element={<ChapterPage />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <footer className="workspace-footer">
            <Logo small />
            <span>Apprendre pour longtemps.</span>
          </footer>
        </main>
      </div>
      <Dialog open={mobile} onOpenChange={setMobile} title="Navigation">
        <div className="mobile-sidebar">{menu}</div>
      </Dialog>
      <SearchDialog open={search} setOpen={setSearch} />
    </div>
  );
}
function SearchDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const data = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Overview>('/dashboard'),
    enabled: open,
  });
  const results =
    data.data?.subjects
      .flatMap((s) => [
        { id: s.id, title: s.name, subtitle: 'Matière', url: `/subjects/${s.id}` },
        ...s.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: s.name,
          url: `/chapters/${c.id}`,
        })),
      ])
      .filter((r) => (r.title + ' ' + r.subtitle).toLowerCase().includes(term.toLowerCase()))
      .slice(0, 12) ?? [];
  return (
    <Dialog {...{ open }} onOpenChange={setOpen} title="Retrouver une matière ou un chapitre">
      <div className="search-input">
        <Search size={19} />
        <input
          aria-label="Rechercher dans mes matières"
          placeholder="Une matière, un chapitre…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      <div className="search-results">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setOpen(false);
              navigate(r.url);
            }}
          >
            <BookOpen size={17} />
            <span>
              {r.title}
              <small>{r.subtitle}</small>
            </span>
          </button>
        ))}
        {!results.length && (
          <p className="muted">
            {data.isError ? data.error.message : 'Aucun résultat pour le moment.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
