import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Leads from "./pages/Leads";
import LockGate from "./components/LockScreen";
import Sessions from "./pages/Sessions";
import Transactions from "./pages/Transactions";
import Inform from "./pages/Inform";
import Invoices from "./pages/Invoices";
import More from "./pages/More";
import Prices from "./pages/Prices";
import SettingsPage from "./pages/Settings";

const icons = {
  home: "M3 10.5 12 3l9 7.5V21H3z",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87",
  calendar: "M3 9h18M7 3v3m10-3v3M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  invoice: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5",
  more: "M4 6h16M4 12h16M4 18h16",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const TABS = [
  { to: "/", label: "Start", icon: icons.home, end: true },
  { to: "/klanten", label: "Klanten", icon: icons.users },
  { to: "/sessies", label: "Sessies", icon: icons.calendar },
  { to: "/facturen", label: "Facturen", icon: icons.invoice },
  { to: "/meer", label: "Meer", icon: icons.more },
];

export default function App() {
  return (
    <LockGate>
      <Shell />
    </LockGate>
  );
}

function Shell() {
  return (
    <div className="app">
      <nav className="nav">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <Icon d={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/klanten" element={<Clients />} />
          <Route path="/klanten/:id" element={<ClientDetail />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/sessies" element={<Sessions />} />
          <Route path="/verkopen" element={<Transactions />} />
          <Route path="/inform" element={<Inform />} />
          <Route path="/facturen" element={<Invoices />} />
          <Route path="/prijzen" element={<Prices />} />
          <Route path="/instellingen" element={<SettingsPage />} />
          <Route path="/meer" element={<More />} />
        </Routes>
      </main>
    </div>
  );
}
