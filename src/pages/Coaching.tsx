import { Link } from "react-router-dom";
import { Empty } from "../components/ui";
import { useClients, useOverview } from "../hooks/useData";
import { addDays, today } from "../domain/dates";

/**
 * The coaching hub.
 *
 * The spec calls this the heart of the app: programmes, exercises, session
 * reports, evaluations, check-ins and habits. Three of those are real modules
 * that do not exist yet, and each needs a decision from Yens about how he
 * actually works before it can be modelled. They are listed here with what is
 * missing, rather than as buttons that lead nowhere.
 */

interface Entry {
  to?: string;
  title: string;
  sub: string;
  count?: string;
  /** What still has to be decided before this can be built. */
  pending?: string;
}

export default function Coaching() {
  const clients = useClients();
  const overview = useOverview();

  if (!clients || !overview) return <Empty>Laden…</Empty>;

  const now = today();
  const soon = addDays(now, 14);
  const dueEvaluations = clients.filter(
    (c) => c.status === "Actief" && c.nextEvaluation && c.nextEvaluation <= soon,
  ).length;

  const ready: Entry[] = [
    {
      to: "/coach/evaluaties",
      title: "Evaluaties",
      sub: "Plannen, metingen vergelijken en de evolutie zien",
      count: dueEvaluations > 0 ? `${dueEvaluations} binnenkort` : "niets binnenkort",
    },
    {
      to: "/coach/opvolging",
      title: "Opvolging",
      sub: "Leads en mensen die nog geen klant zijn",
    },
  ];

  const todo: Entry[] = [
    {
      title: "Trainingsprogramma's",
      sub: "Maken, dupliceren, aanpassen en toewijzen",
      pending:
        "Eerst afspreken hoe je een programma opbouwt: fases met blokken en oefeningen, of een doel per periode met notities. Dat verschil bepaalt hoe alles eronder eruitziet.",
    },
    {
      title: "Oefeningenbibliotheek",
      sub: "Categorie, spiergroep, video, uitleg, coachingtips",
      pending:
        "De video's staan straks op YouTube en de app bewaart enkel de link. Zolang er geen video's zijn, blijft dit een lijst met tekst en tips — bruikbaar, maar het wachten is op de eerste oefeningen.",
    },
    {
      title: "Sessieverslagen",
      sub: "Verloop, aandachtspunten, volgende focus, klachten",
      pending:
        "Klein stuk werk, maar het hangt aan de programma's: een verslag verwijst naar wat er die dag op het schema stond.",
    },
    {
      title: "Check-ins",
      sub: "Energie, slaap, voeding, stress, herstel, motivatie",
      pending:
        "Vraagt eerst een klantenportaal waar mensen die check-in invullen. Nu ziet een klant enkel zijn eigen overzicht.",
    },
    {
      title: "Gewoontes",
      sub: "Wandelen, water, eiwitten, slaap, mobiliteit, meditatie",
      pending: "Zelfde afhankelijkheid als check-ins: de klant moet iets kunnen afvinken.",
    },
  ];

  return (
    <>
      <h1>Coaching</h1>
      <p className="sub">Alles wat met de begeleiding zelf te maken heeft.</p>

      <div className="list">
        {ready.map((e) => (
          <Link key={e.title} to={e.to!}>
            <div>
              <div className="item-title">{e.title}</div>
              <div className="item-sub">{e.sub}</div>
            </div>
            <span className="muted">{e.count ?? "›"}</span>
          </Link>
        ))}
      </div>

      <h2>Nog te bouwen</h2>
      <p className="sub">
        Deze onderdelen staan in de nota maar vragen eerst een keuze. Gokken op het datamodel kost
        meer dan even afstemmen.
      </p>

      <div className="stack">
        {todo.map((e) => (
          <div className="card" key={e.title}>
            <strong>{e.title}</strong>
            <div className="item-sub">{e.sub}</div>
            <div className="item-sub" style={{ marginTop: 8, color: "var(--muted)" }}>
              {e.pending}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
