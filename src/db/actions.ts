import { db } from "./db";
import type { Appointment, Session, SessionStatus } from "./schema";
import { bucketOf, isChargeable, isLooseSale } from "../domain/credits";

/**
 * Books a paid-but-unused losse sessie against a freshly logged session
 * (mogelijkheid B). No-op when the client has pack credits to draw on, since
 * those expire and should drain first.
 */
async function linkLooseSale(session: Session, sessionId: number): Promise<void> {
  if (!isChargeable(session.status)) return;

  const bucket = bucketOf(session.location, session.sessionType);
  const clientTx = await db.transactions.where("clientId").equals(session.clientId).toArray();

  const hasPackCredit = clientTx.some(
    (t) =>
      !isLooseSale(t) &&
      bucketOf(t.location, t.sessionType) === bucket &&
      t.date <= session.date &&
      (!t.expiresOn || t.expiresOn >= session.date),
  );
  if (hasPackCredit) return;

  const loose = clientTx
    .filter(
      (t) =>
        isLooseSale(t) &&
        !t.sessionId &&
        t.date <= session.date &&
        bucketOf(t.location, t.sessionType) === bucket,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (loose) await db.transactions.update(loose.id!, { sessionId });
}

/**
 * Deletes a record and leaves a tombstone, so the next sync removes it from the
 * server as well. Both happen in one transaction: a delete without its
 * tombstone would silently come back on the next pull.
 */
export async function removeRecord(table: SyncedTable, localId: number): Promise<void> {
  await db.transaction("rw", [db[table], db.idmap, db.tombstones], async () => {
    const map = await db.idmap.get({ table, localId });
    await (db[table] as unknown as { delete(k: number): Promise<void> }).delete(localId);
    await db.tombstones.add({
      table,
      localId,
      remoteId: map?.remoteId,
      at: new Date().toISOString(),
    });
    if (map) await db.idmap.delete([table, localId]);
  });
}

export type SyncedTable =
  | "clients"
  | "transactions"
  | "sessions"
  | "inform"
  | "invoices"
  | "leads"
  | "appointments";

/** A client plus everything hanging off them, tombstoned as one unit. */
export async function removeClientCascade(clientId: number): Promise<void> {
  const [sessions, transactions] = await Promise.all([
    db.sessions.where("clientId").equals(clientId).primaryKeys(),
    db.transactions.where("clientId").equals(clientId).primaryKeys(),
  ]);
  for (const id of sessions) await removeRecord("sessions", id as number);
  for (const id of transactions) await removeRecord("transactions", id as number);
  await removeRecord("clients", clientId);
}

export async function addSession(session: Session): Promise<number> {
  return db.transaction("rw", [db.sessions, db.transactions], async () => {
    const id = await db.sessions.add(session);
    await linkLooseSale(session, id);
    return id;
  });
}

/**
 * Plans one training for one or more people. Nothing is charged here; the
 * credit only moves when the appointment is later logged as done.
 */
export async function planAppointment(
  base: Omit<Appointment, "id" | "clientId" | "status" | "groupId" | "sessionId">,
  clientIds: number[],
): Promise<void> {
  const groupId = clientIds.length > 1 ? await nextGroupId() : undefined;
  await db.transaction("rw", db.appointments, async () => {
    for (const clientId of clientIds) {
      await db.appointments.add({ ...base, clientId, status: "Gepland", groupId });
    }
  });
}

/**
 * Turns a planned appointment into the session that actually happened, with
 * whatever outcome. Credits follow the session's status, exactly as when
 * logging one directly.
 */
export async function completeAppointment(
  appointment: Appointment,
  status: SessionStatus,
): Promise<void> {
  const sessionId = await addSession({
    date: appointment.date,
    clientId: appointment.clientId,
    location: appointment.location,
    sessionType: appointment.sessionType,
    status,
    groupId: appointment.groupId,
    note: appointment.note,
  });
  await db.appointments.update(appointment.id!, { sessionId });
}

/** Next free group reference, formatted like G0041. */
export async function nextGroupId(): Promise<string> {
  const sessions = await db.sessions.toArray();
  const highest = sessions.reduce((max, s) => {
    const m = s.groupId?.match(/^G(\d+)$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `G${String(highest + 1).padStart(4, "0")}`;
}

export interface GroupParticipant {
  clientId: number;
  status: SessionStatus;
}

/**
 * One shared training, one session record per participant. They carry the same
 * groupId so it stays visible that they belong together, while each client
 * keeps their own credit consumption.
 */
export async function addGroupSessions(
  base: Omit<Session, "id" | "clientId" | "status" | "groupId">,
  participants: GroupParticipant[],
): Promise<string> {
  const groupId = await nextGroupId();
  await db.transaction("rw", [db.sessions, db.transactions], async () => {
    for (const p of participants) {
      const session: Session = { ...base, clientId: p.clientId, status: p.status, groupId };
      const id = await db.sessions.add(session);
      await linkLooseSale(session, id);
    }
  });
  return groupId;
}
