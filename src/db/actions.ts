import { db } from "./db";
import type { Session, SessionStatus } from "./schema";
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

export async function addSession(session: Session): Promise<number> {
  return db.transaction("rw", [db.sessions, db.transactions], async () => {
    const id = await db.sessions.add(session);
    await linkLooseSale(session, id);
    return id;
  });
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
