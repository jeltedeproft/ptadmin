import { Link } from "react-router-dom";
import { Empty } from "../components/ui";
import { useClients } from "../hooks/useData";

/**
 * Nog niet gebouwd. Bewust een leeg scherm met uitleg in plaats van een
 * halve module: hoe een programma eruit moet zien (schema per klant, blokken,
 * oefeningen, progressie) is nog niet afgesproken met Yens.
 */
export default function Programmes() {
  const clients = useClients();
  const active = clients?.filter((c) => c.status === "Actief") ?? [];

  return (
    <>
      <h1>Programma's</h1>
      <p className="sub">Trainingsschema's per klant.</p>

      <div className="alert" style={{ borderLeftColor: "var(--accent)", marginBottom: 18 }}>
        <strong>Dit onderdeel moet nog gebouwd worden.</strong> Voor het zinvol is, moeten we van
        Yens weten hoe hij een programma opbouwt: een schema per klant met blokken en oefeningen,
        of eerder een doel per periode met losse notities? Dat verschil bepaalt het datamodel, dus
        het heeft geen zin daarop te gokken.
      </div>

      <p className="sub">
        Tot dan staan losse afspraken per klant in het notitieveld, en houden de evaluaties de
        voortgang bij.
      </p>

      {active.length > 0 && (
        <>
          <h2>Actieve klanten</h2>
          <div className="list">
            {active.map((c) => (
              <Link key={c.id} to={`/coach/klanten/${c.id}`}>
                <div>
                  <div className="item-title">{c.name}</div>
                  <div className="item-sub">{c.note ? c.note.split("\n")[0] : "geen notities"}</div>
                </div>
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {clients && active.length === 0 && <Empty>Nog geen actieve klanten.</Empty>}
    </>
  );
}
