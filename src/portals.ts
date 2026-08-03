/**
 * The app is three products sharing one database.
 *
 *   coach    — the training relationship: clients, programmes, evaluations,
 *              follow-up. What Yens does with people.
 *   business — the company: planning, credits, payments, invoicing, reports.
 *              What Yens does with money.
 *   client   — a trainee's own view. Read-only, only ever their own data.
 *
 * Which portals a login may open follows its role, so the client portal cannot
 * be reached by typing a coach URL. The real barrier is the row-level security
 * in supabase/migrations/0001_init.sql — this only keeps the UI honest.
 */
export type Portal = "coach" | "business" | "client";

/**
 * owner   — runs the business, sees the money.
 * trainer — works for an owner: the people, never the finances.
 * client  — their own records only.
 */
export type Role = "owner" | "trainer" | "client";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V21H3z",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87",
  calendar: "M3 9h18M7 3v3m10-3v3M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  invoice: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5",
  more: "M4 6h16M4 12h16M4 18h16",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  card: "M2 7h20v12H2zM2 11h20",
} as const;

export const PORTALS: Record<Portal, { label: string; hint: string; home: string }> = {
  coach: { label: "Coach", hint: "Klanten en begeleiding", home: "/coach" },
  business: { label: "Zaak", hint: "Planning, geld en cijfers", home: "/business" },
  client: { label: "Mijn training", hint: "Jouw overzicht", home: "/mij" },
};

export const NAV: Record<Portal, NavItem[]> = {
  coach: [
    { to: "/coach", label: "Home", icon: ICONS.home },
    { to: "/coach/agenda", label: "Agenda", icon: ICONS.calendar },
    { to: "/coach/klanten", label: "Klanten", icon: ICONS.users },
    { to: "/coach/coaching", label: "Coaching", icon: ICONS.clipboard },
  ],
  business: [
    { to: "/business", label: "Dashboard", icon: ICONS.home },
    { to: "/business/credits", label: "Credits", icon: ICONS.card },
    { to: "/business/facturen", label: "Facturen", icon: ICONS.invoice },
    { to: "/business/rapporten", label: "Rapporten", icon: ICONS.chart },
    { to: "/business/meer", label: "Meer", icon: ICONS.more },
  ],
  client: [
    { to: "/mij", label: "Overzicht", icon: ICONS.home },
    { to: "/mij/sessies", label: "Sessies", icon: ICONS.calendar },
    { to: "/mij/pakketten", label: "Pakketten", icon: ICONS.card },
  ],
};

export function portalsFor(role: Role): Portal[] {
  switch (role) {
    case "owner":
      return ["coach", "business"];
    case "trainer":
      return ["coach"];
    default:
      return ["client"];
  }
}

/** Whether this role may see money at all. The server decides too. */
export function seesFinancials(role: Role | null): boolean {
  return role === "owner";
}

/** Owner or trainer: anyone who works with the clients. */
export function isStaff(role: Role | null): boolean {
  return role === "owner" || role === "trainer";
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "eigenaar",
  trainer: "trainer",
  client: "klant",
};

export function portalOf(pathname: string): Portal {
  if (pathname.startsWith("/mij")) return "client";
  if (pathname.startsWith("/coach")) return "coach";
  return "business";
}
