import { db } from "../db/db";
import { requireSupabase } from "../db/supabase";
import { SPECS, type Resolve, type TableName, type Unresolve } from "./rows";

/**
 * Local-first synchronisation.
 *
 * The app keeps writing to IndexedDB and stays fully usable offline — logging a
 * session after a training must not depend on the gym's signal. This module
 * moves those records to Postgres and back.
 *
 * Identity: local records keep their Dexie auto-increment, Postgres assigns its
 * own, and `idmap` ties the two together. That is why foreign keys are rewritten
 * on the way out and back; it also means a record already pushed is updated
 * rather than duplicated on the next run.
 *
 * Conflicts: last write wins, per record. With one coach writing this is
 * adequate. It stops being adequate the moment two people edit the same client
 * on two devices at once, and it would need per-field merging then.
 */

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
  skipped: number;
  errors: string[];
  at: string;
}

const empty = (): SyncResult => ({
  pushed: 0,
  pulled: 0,
  deleted: 0,
  skipped: 0,
  errors: [],
  at: new Date().toISOString(),
});

const LAST_PULL = "lastPulledAt";

async function loadMaps() {
  const rows = await db.idmap.toArray();
  const toRemote = new Map<string, string | number>();
  const toLocal = new Map<string, number>();
  for (const r of rows) {
    toRemote.set(`${r.table}:${r.localId}`, r.remoteId);
    toLocal.set(`${r.table}:${r.remoteId}`, r.localId);
  }
  const resolve: Resolve = (t, localId) => toRemote.get(`${t}:${localId}`);
  const unresolve: Unresolve = (t, remoteId) => toLocal.get(`${t}:${remoteId}`);
  return { resolve, unresolve, toRemote, toLocal };
}

async function remember(table: TableName, localId: number, remoteId: string | number) {
  await db.idmap.put({ table, localId, remoteId });
}

/** Every local table, in dependency order. */
async function localRows(spec: (typeof SPECS)[number]): Promise<{ id: number; rec: unknown }[]> {
  // `prices` is keyed by its code rather than a number; it is handled separately.
  const table = (db as unknown as Record<string, { toArray(): Promise<unknown[]> }>)[spec.local];
  const rows = (await table.toArray()) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, rec: r }));
}

/**
 * Sends everything local that Postgres does not have yet, and updates what it
 * already has. Safe to run repeatedly: the id map keeps it from duplicating.
 */
export async function push(coachId: string): Promise<SyncResult> {
  const sb = requireSupabase();
  const result = empty();

  // Deletions first: a record removed here should not be re-sent below.
  for (const stone of await db.tombstones.toArray()) {
    if (stone.remoteId === undefined) {
      // Never reached the server; nothing to remove there.
      await db.tombstones.delete(stone.id!);
      continue;
    }
    const spec = SPECS.find((s) => s.local === stone.table);
    if (!spec) {
      await db.tombstones.delete(stone.id!);
      continue;
    }
    const column = spec.local === "prices" ? "code" : "id";
    const { error } = await sb.from(spec.remote).delete().eq(column, stone.remoteId);
    if (error) {
      result.errors.push(`${spec.remote} verwijderen: ${error.message}`);
      continue;
    }
    await db.tombstones.delete(stone.id!);
    result.deleted += 1;
  }

  for (const spec of SPECS) {
    let { resolve } = await loadMaps();

    if (spec.local === "prices") {
      // Prices carry their own text primary key, so they upsert directly.
      const rows = await db.prices.toArray();
      const payload = rows.map((p) => spec.toRow(p, coachId, resolve)).filter(Boolean);
      if (payload.length === 0) continue;
      const { error } = await sb
        .from(spec.remote)
        .upsert(payload as never, { onConflict: "coach_id,code" });
      if (error) result.errors.push(`${spec.remote}: ${error.message}`);
      else result.pushed += payload.length;
      continue;
    }

    const rows = await localRows(spec);
    for (const { id, rec } of rows) {
      const known = resolve(spec.local, id);
      const row = spec.toRow(rec, coachId, resolve);
      if (!row) {
        // Depends on something not pushed yet — a later pass will catch it.
        result.skipped += 1;
        continue;
      }

      if (known === undefined) {
        const { data, error } = await sb.from(spec.remote).insert(row as never).select("id").single();
        if (error) {
          result.errors.push(`${spec.remote} #${id}: ${error.message}`);
          continue;
        }
        await remember(spec.local, id, (data as { id: string | number }).id);
        ({ resolve } = await loadMaps());
        result.pushed += 1;
      } else {
        const { error } = await sb.from(spec.remote).update(row as never).eq("id", known);
        if (error) result.errors.push(`${spec.remote} #${id}: ${error.message}`);
        else result.pushed += 1;
      }
    }
  }

  // Settings are a single JSON blob per coach.
  const settings = await db.settings.get(1);
  if (settings) {
    const { accessCodeHash: _h, accessCodeSalt: _s, ...shared } = settings;
    const { error } = await sb
      .from("settings")
      .upsert({ coach_id: coachId, data: shared } as never, { onConflict: "coach_id" });
    if (error) result.errors.push(`settings: ${error.message}`);
  }

  await db.syncmeta.put({ key: "lastPushedAt", value: result.at });
  return result;
}

/**
 * Brings down anything changed remotely since the last pull — the other
 * device's work. Records already known locally are updated in place.
 */
export async function pull(coachId: string): Promise<SyncResult> {
  const sb = requireSupabase();
  const result = empty();
  const since = (await db.syncmeta.get(LAST_PULL))?.value;

  for (const spec of SPECS) {
    const { unresolve } = await loadMaps();

    let query = sb.from(spec.remote).select("*");
    // Only tables with updated_at can be fetched incrementally; the rest are
    // small enough to re-read in full.
    if (since && ["clients", "transactions", "sessions", "invoices"].includes(spec.remote)) {
      query = query.gt("updated_at", since);
    }
    const { data, error } = await query;
    if (error) {
      result.errors.push(`${spec.remote}: ${error.message}`);
      continue;
    }

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const record = spec.fromRow(row, unresolve);
      if (!record) {
        result.skipped += 1;
        continue;
      }
      const remoteId = row.id as string | number;

      if (spec.local === "prices") {
        await db.prices.put(record);
        result.pulled += 1;
        continue;
      }

      const localId = unresolve(spec.local, remoteId);
      const table = (db as unknown as Record<string, {
        put(v: unknown): Promise<unknown>;
        add(v: unknown): Promise<number>;
      }>)[spec.local];

      if (localId === undefined) {
        const newId = await table.add(record);
        await remember(spec.local, newId, remoteId);
      } else {
        await table.put({ ...record, id: localId });
      }
      result.pulled += 1;
    }
  }

  // Records deleted on another device. An incremental pull cannot see a row
  // that no longer exists, so the surviving ids are compared against the map.
  for (const spec of SPECS) {
    if (spec.local === "prices") continue;
    const { data, error } = await sb.from(spec.remote).select("id");
    if (error) {
      result.errors.push(`${spec.remote} controleren: ${error.message}`);
      continue;
    }
    const alive = new Set((data ?? []).map((r) => String((r as { id: unknown }).id)));
    const mapped = await db.idmap.where("table").equals(spec.local).toArray();
    for (const m of mapped) {
      if (alive.has(String(m.remoteId))) continue;
      await db.transaction("rw", [db[spec.local], db.idmap], async () => {
        await (db[spec.local] as unknown as { delete(k: number): Promise<void> }).delete(m.localId);
        await db.idmap.delete([spec.local, m.localId]);
      });
      result.deleted += 1;
    }
  }

  // Settings: everything except the device-local access code.
  const { data: remoteSettings } = await sb
    .from("settings")
    .select("data")
    .eq("coach_id", coachId)
    .maybeSingle();
  if (remoteSettings?.data) {
    const local = await db.settings.get(1);
    await db.settings.put({
      ...(remoteSettings.data as object),
      id: 1,
      accessCodeHash: local?.accessCodeHash,
      accessCodeSalt: local?.accessCodeSalt,
    } as never);
    result.pulled += 1;
  }

  await db.syncmeta.put({ key: LAST_PULL, value: result.at });
  return result;
}

export async function syncNow(coachId: string): Promise<SyncResult> {
  const up = await push(coachId);
  const down = await pull(coachId);
  return {
    pushed: up.pushed,
    pulled: down.pulled,
    deleted: up.deleted + down.deleted,
    skipped: up.skipped + down.skipped,
    errors: [...up.errors, ...down.errors],
    at: down.at,
  };
}

export async function lastSyncedAt(): Promise<string | undefined> {
  return (await db.syncmeta.get(LAST_PULL))?.value;
}

/** How much local data has never reached the server. */
export async function pendingCount(): Promise<number> {
  const mapped = await db.idmap.toArray();
  const seen = new Set(mapped.map((m) => `${m.table}:${m.localId}`));
  let pending = 0;
  for (const spec of SPECS) {
    if (spec.local === "prices") continue;
    const rows = await localRows(spec);
    pending += rows.filter((r) => !seen.has(`${spec.local}:${r.id}`)).length;
  }
  return pending;
}
