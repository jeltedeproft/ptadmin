import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Sessions from "./pages/Sessions";
import Transactions from "./pages/Transactions";
import Inform from "./pages/Inform";
import Invoices from "./pages/Invoices";
import More from "./pages/More";
import Prices from "./pages/Prices";
import SettingsPage from "./pages/Settings";
import Leads from "./pages/Leads";
import Credits from "./pages/Credits";
import Planning from "./pages/Planning";
import Programmes from "./pages/Programmes";
import Reports from "./pages/Reports";
import Evaluations from "./pages/Evaluations";
import LockGate from "./components/LockScreen";
import Login from "./pages/Login";
import ClientHome from "./pages/ClientHome";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { hasBackend } from "./db/supabase";
import { useAutoSync } from "./sync/useAutoSync";
import { NAV, PORTALS, portalOf, portalsFor, type Portal, type Role } from "./portals";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/**
 * Order matters: the account decides *who* you are, the device code only keeps
 * a stray pair of hands out. Without a backend configured the app falls back to
 * its device-local behaviour and skips sign-in entirely.
 */
function Gate() {
  const { loading, session, role } = useAuth();

  if (!hasBackend) {
    return (
      <LockGate>
        <Shell role="owner" />
      </LockGate>
    );
  }
  if (loading) return <div className="lock" />;
  if (!session) return <Login />;

  return (
    <LockGate>
      <Shell role={role ?? "client"} />
    </LockGate>
  );
}

function Shell({ role }: { role: Role }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { running } = useAutoSync();
  const available = portalsFor(role);
  const home = PORTALS[available[0]].home;
  // A client landing on a coach URL is sent home rather than shown empty screens.
  const requested = portalOf(location.pathname);
  const portal = available.includes(requested) ? requested : available[0];
  const items = NAV[portal];

  return (
    <div className="app">
      <nav className="nav">
        {items.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === `/${portal}` || t.to === "/coach" || t.to === "/mij"}>
            <Icon d={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="main">
        {running && <div className="syncing">Synchroniseren…</div>}
        {available.length > 1 && (
          <div className="portalbar">
            {available.map((p) => (
              <button
                key={p}
                className={p === portal ? "on" : ""}
                onClick={() => navigate(PORTALS[p].home)}
              >
                {PORTALS[p].label}
              </button>
            ))}
          </div>
        )}

        <Routes>
          {/* Client — read-only, their own data only. The server enforces that;
              this routing only keeps the UI coherent. */}
          <Route path="/mij" element={<ClientHome />} />
          <Route path="/mij/sessies" element={<ClientHome view="sessies" />} />
          <Route path="/mij/pakketten" element={<ClientHome view="pakketten" />} />

          {/* Coach — the training relationship */}
          <Route path="/coach" element={<Clients />} />
          <Route path="/coach/klanten/:id" element={<ClientDetail />} />
          <Route path="/coach/programmas" element={<Programmes />} />
          <Route path="/coach/evaluaties" element={<Evaluations />} />
          <Route path="/coach/opvolging" element={<Leads />} />

          {/* Business — the company */}
          <Route path="/business" element={<Dashboard />} />
          <Route path="/business/planning" element={<Planning />} />
          <Route path="/business/credits" element={<Credits />} />
          <Route path="/business/verkopen" element={<Transactions />} />
          <Route path="/business/sessies" element={<Sessions />} />
          <Route path="/business/inform" element={<Inform />} />
          <Route path="/business/facturen" element={<Invoices />} />
          <Route path="/business/rapporten" element={<Reports />} />
          <Route path="/business/prijzen" element={<Prices />} />
          <Route path="/business/instellingen" element={<SettingsPage />} />
          <Route path="/business/meer" element={<More />} />

          {/* Old links from before the split. */}
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/klanten" element={<Navigate to="/coach" replace />} />
          <Route path="/klanten/:id" element={<LegacyClient />} />
          <Route path="/sessies" element={<Navigate to="/business/sessies" replace />} />
          <Route path="/verkopen" element={<Navigate to="/business/verkopen" replace />} />
          <Route path="/inform" element={<Navigate to="/business/inform" replace />} />
          <Route path="/facturen" element={<Navigate to="/business/facturen" replace />} />
          <Route path="/prijzen" element={<Navigate to="/business/prijzen" replace />} />
          <Route path="/instellingen" element={<Navigate to="/business/instellingen" replace />} />
          <Route path="/leads" element={<Navigate to="/coach/opvolging" replace />} />
          <Route path="/meer" element={<Navigate to="/business/meer" replace />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}

/** Keeps deep links to a client working after the move under /coach. */
function LegacyClient() {
  const { pathname } = useLocation();
  return <Navigate to={pathname.replace("/klanten/", "/coach/klanten/")} replace />;
}

export type { Portal };
