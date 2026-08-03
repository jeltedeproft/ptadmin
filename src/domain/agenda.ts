import type { Appointment } from "../db/schema";

/**
 * Laying out a week on a time grid.
 *
 * Two things make this more than "position by start time":
 *
 * A duo is stored as one appointment per participant, sharing a groupId. Drawn
 * naively they land exactly on top of each other. They are one block with two
 * names on it.
 *
 * Genuinely different appointments can still overlap — two clients booked at
 * the same hour in different locations. Those get placed side by side, each
 * taking a share of the column width.
 */

export interface Block {
  key: string;
  date: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
  appointments: Appointment[];
  /** Set once the training happened. */
  done: boolean;
  /** Column index and how many columns share this slot. */
  column: number;
  columns: number;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function timeOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One block per training: a duo's two rows become a single entry. */
export function toBlocks(appointments: Appointment[]): Block[] {
  const grouped = new Map<string, Appointment[]>();

  for (const a of appointments) {
    // Only group when the group actually shares a moment — a groupId reused on
    // another day or hour is a different training.
    const key = a.groupId ? `g:${a.groupId}:${a.date}:${a.startTime}` : `a:${a.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), a]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const first = group[0];
      const start = minutesOf(first.startTime);
      return {
        key,
        date: first.date,
        start,
        // A zero-length block would be invisible; give it a floor.
        end: start + Math.max(15, first.durationMinutes),
        appointments: group,
        done: group.every((a) => a.sessionId !== undefined),
        column: 0,
        columns: 1,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

/**
 * Places overlapping blocks side by side, per day.
 *
 * Walks the day in order and keeps a running cluster of blocks that touch each
 * other. Everything in one cluster shares the available width, so two bookings
 * at nine o'clock each take half a column rather than covering one another.
 */
export function layout(blocks: Block[]): Block[] {
  const byDay = new Map<string, Block[]>();
  for (const b of blocks) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);

  const out: Block[] = [];

  for (const day of byDay.values()) {
    let cluster: Block[] = [];
    let clusterEnd = -1;

    const flush = () => {
      for (const b of cluster) b.columns = cluster.length;
      out.push(...cluster);
      cluster = [];
      clusterEnd = -1;
    };

    for (const block of day) {
      if (cluster.length > 0 && block.start >= clusterEnd) flush();

      // First free column within this cluster.
      const taken = new Set(cluster.filter((b) => b.end > block.start).map((b) => b.column));
      let column = 0;
      while (taken.has(column)) column++;

      block.column = column;
      cluster.push(block);
      clusterEnd = Math.max(clusterEnd, block.end);
    }
    flush();
  }

  return out;
}

/**
 * The hours the grid should cover. Defaults to a normal working day and widens
 * for anything outside it, so a 06:30 client is never cut off.
 */
export function gridRange(blocks: Block[], defaultFrom = 7, defaultTo = 21): [number, number] {
  let from = defaultFrom;
  let to = defaultTo;
  for (const b of blocks) {
    from = Math.min(from, Math.floor(b.start / 60));
    to = Math.max(to, Math.ceil(b.end / 60));
  }
  return [Math.max(0, from), Math.min(24, Math.max(to, from + 1))];
}

export function blockLabel(block: Block, nameOf: (id: number) => string): string {
  const names = block.appointments.map((a) => nameOf(a.clientId));
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} +${names.length - 1}`;
}
