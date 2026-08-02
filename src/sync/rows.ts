import type {
  Appointment,
  Client,
  Evaluation,
  InformEntry,
  Invoice,
  Lead,
  PriceItem,
  Session,
  Transaction,
} from "../db/schema";

/**
 * Translation between the local records and the Postgres rows.
 *
 * Two things differ and both have to be handled here rather than leaking into
 * the app: Postgres uses snake_case, and it owns the primary keys. Locally a
 * record is keyed by a Dexie auto-increment; remotely by an identity column.
 * Foreign keys therefore have to be rewritten in both directions, which is what
 * `resolve` does — see mapping.ts.
 */

export type Resolve = (table: TableName, localId: number) => string | number | undefined;
export type Unresolve = (table: TableName, remoteId: string | number) => number | undefined;

export type TableName =
  | "clients"
  | "prices"
  | "transactions"
  | "sessions"
  | "inform"
  | "invoices"
  | "leads"
  | "appointments"
  | "evaluations";

export interface TableSpec<T> {
  /** Dexie table name. */
  local: TableName;
  /** Postgres table name. */
  remote: string;
  /** Tables whose ids this one points at; they must sync first. */
  dependsOn: TableName[];
  toRow(record: T, coachId: string, resolve: Resolve): Record<string, unknown> | null;
  fromRow(row: Record<string, unknown>, unresolve: Unresolve): T | null;
}

const iso = (v: unknown): string | undefined => (v ? String(v).slice(0, 10) : undefined);
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export const CLIENTS: TableSpec<Client> = {
  local: "clients",
  remote: "clients",
  dependsOn: [],
  toRow: (c, coachId) => ({
    coach_id: coachId,
    name: c.name,
    billing_name: c.billingName ?? null,
    birth_date: c.birthDate ?? null,
    status: c.status,
    start_date: c.startDate,
    location: c.location,
    last_evaluation: c.lastEvaluation ?? null,
    next_evaluation: c.nextEvaluation ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    billing_address: c.billingAddress ?? null,
    company_number: c.companyNumber ?? null,
    note: c.note ?? null,
  }),
  fromRow: (r) => ({
    name: r.name as string,
    billingName: (r.billing_name as string) ?? undefined,
    birthDate: iso(r.birth_date),
    status: r.status as Client["status"],
    startDate: iso(r.start_date)!,
    location: r.location as Client["location"],
    lastEvaluation: iso(r.last_evaluation),
    nextEvaluation: iso(r.next_evaluation),
    email: (r.email as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    billingAddress: (r.billing_address as string) ?? undefined,
    companyNumber: (r.company_number as string) ?? undefined,
    note: (r.note as string) ?? undefined,
  }),
};

export const PRICES: TableSpec<PriceItem> = {
  local: "prices",
  remote: "prices",
  dependsOn: [],
  toRow: (p, coachId) => ({
    code: p.code,
    coach_id: coachId,
    base_code: p.baseCode,
    location: p.location,
    session_type: p.sessionType,
    product: p.product,
    amount: p.amount,
    credits: p.credits,
    validity_months: p.validityMonths,
    active_from: p.activeFrom ?? null,
    active_until: p.activeUntil ?? null,
    active: p.active,
    note: p.note ?? null,
  }),
  fromRow: (r) => ({
    code: r.code as string,
    baseCode: r.base_code as string,
    location: r.location as PriceItem["location"],
    sessionType: r.session_type as PriceItem["sessionType"],
    product: r.product as PriceItem["product"],
    amount: num(r.amount),
    credits: num(r.credits),
    validityMonths: num(r.validity_months),
    activeFrom: iso(r.active_from),
    activeUntil: iso(r.active_until),
    active: r.active as boolean,
    note: (r.note as string) ?? undefined,
  }),
};

export const TRANSACTIONS: TableSpec<Transaction> = {
  local: "transactions",
  remote: "transactions",
  dependsOn: ["clients", "sessions"],
  toRow: (t, coachId, resolve) => {
    const client = resolve("clients", t.clientId);
    // A purchase without its client would violate the foreign key; skip it and
    // let the next pass pick it up once the client exists remotely.
    if (client === undefined) return null;
    return {
      coach_id: coachId,
      client_id: client,
      date: t.date,
      location: t.location,
      session_type: t.sessionType,
      product: t.product,
      product_code: t.productCode,
      credits_bought: t.creditsBought,
      amount: t.amount,
      validity_months: t.validityMonths,
      expires_on: t.expiresOn ?? null,
      paid: t.paid,
      paid_on: t.paidOn ?? null,
      payment_method: t.paymentMethod ?? null,
      invoice_needed: t.invoiceNeeded,
      invoice_number: t.invoiceNumber ?? null,
      session_id: t.sessionId === undefined ? null : (resolve("sessions", t.sessionId) ?? null),
      note: t.note ?? null,
    };
  },
  fromRow: (r, unresolve) => {
    const clientId = unresolve("clients", r.client_id as number);
    if (clientId === undefined) return null;
    return {
      clientId,
      date: iso(r.date)!,
      location: r.location as Transaction["location"],
      sessionType: r.session_type as Transaction["sessionType"],
      product: r.product as Transaction["product"],
      productCode: r.product_code as string,
      creditsBought: num(r.credits_bought),
      amount: num(r.amount),
      validityMonths: num(r.validity_months),
      expiresOn: iso(r.expires_on),
      paid: r.paid as boolean,
      paidOn: iso(r.paid_on),
      paymentMethod: (r.payment_method as Transaction["paymentMethod"]) ?? undefined,
      invoiceNeeded: r.invoice_needed as boolean,
      invoiceNumber: (r.invoice_number as string) ?? undefined,
      sessionId:
        r.session_id === null || r.session_id === undefined
          ? undefined
          : unresolve("sessions", r.session_id as number),
    };
  },
};

export const SESSIONS: TableSpec<Session> = {
  local: "sessions",
  remote: "sessions",
  dependsOn: ["clients"],
  toRow: (s, coachId, resolve) => {
    const client = resolve("clients", s.clientId);
    if (client === undefined) return null;
    return {
      coach_id: coachId,
      client_id: client,
      date: s.date,
      location: s.location,
      session_type: s.sessionType,
      status: s.status,
      group_id: s.groupId ?? null,
      note: s.note ?? null,
    };
  },
  fromRow: (r, unresolve) => {
    const clientId = unresolve("clients", r.client_id as number);
    if (clientId === undefined) return null;
    return {
      clientId,
      date: iso(r.date)!,
      location: r.location as Session["location"],
      sessionType: r.session_type as Session["sessionType"],
      status: r.status as Session["status"],
      groupId: (r.group_id as string) ?? undefined,
      note: (r.note as string) ?? undefined,
    };
  },
};

export const INFORM: TableSpec<InformEntry> = {
  local: "inform",
  remote: "inform_entries",
  dependsOn: [],
  toRow: (e, coachId) => ({
    coach_id: coachId,
    date: e.date,
    session_type: e.sessionType,
    client_or_group: e.clientOrGroup ?? null,
    hours: e.hours,
    hourly_rate: e.hourlyRate,
    amount: e.amount,
    invoiced: e.invoiced,
    invoice_number: e.invoiceNumber ?? null,
    note: e.note ?? null,
  }),
  fromRow: (r) => ({
    date: iso(r.date)!,
    sessionType: r.session_type as InformEntry["sessionType"],
    clientOrGroup: (r.client_or_group as string) ?? undefined,
    hours: num(r.hours),
    hourlyRate: num(r.hourly_rate),
    amount: num(r.amount),
    invoiced: r.invoiced as boolean,
    invoiceNumber: (r.invoice_number as string) ?? undefined,
    note: (r.note as string) ?? undefined,
  }),
};

export const INVOICES: TableSpec<Invoice> = {
  local: "invoices",
  remote: "invoices",
  dependsOn: ["clients"],
  toRow: (i, coachId, resolve) => ({
    coach_id: coachId,
    client_id: i.clientId === undefined ? null : (resolve("clients", i.clientId) ?? null),
    number: i.number,
    date: i.date,
    due_date: i.dueDate,
    type: i.type,
    recipient_name: i.recipientName,
    recipient_address: i.recipientAddress ?? null,
    recipient_email: i.recipientEmail ?? null,
    lines: i.lines,
    vat_amount: i.vatAmount ?? 0,
    amount: i.amount,
    status: i.status,
    paid_on: i.paidOn ?? null,
    source_type: i.sourceType ?? null,
    // Local source ids are meaningless remotely; the invoice keeps its own copy
    // of the lines, so nothing is lost by dropping them.
    source_ids: [],
    note: i.note ?? null,
  }),
  fromRow: (r, unresolve) => ({
    number: r.number as string,
    date: iso(r.date)!,
    dueDate: iso(r.due_date)!,
    type: r.type as Invoice["type"],
    clientId:
      r.client_id === null || r.client_id === undefined
        ? undefined
        : unresolve("clients", r.client_id as number),
    recipientName: r.recipient_name as string,
    recipientAddress: (r.recipient_address as string) ?? undefined,
    recipientEmail: (r.recipient_email as string) ?? undefined,
    lines: (r.lines as Invoice["lines"]) ?? [],
    vatAmount: num(r.vat_amount),
    amount: num(r.amount),
    status: r.status as Invoice["status"],
    paidOn: iso(r.paid_on),
    sourceType: (r.source_type as Invoice["sourceType"]) ?? "transaction",
    sourceIds: [],
    note: (r.note as string) ?? undefined,
  }),
};

export const LEADS: TableSpec<Lead> = {
  local: "leads",
  remote: "leads",
  dependsOn: ["clients"],
  toRow: (l, coachId, resolve) => ({
    coach_id: coachId,
    name: l.name,
    phone: l.phone ?? null,
    email: l.email ?? null,
    source: l.source ?? null,
    first_contact: l.firstContact,
    interest: l.interest ?? null,
    wanted_location: l.wantedLocation ?? null,
    wanted_session_type: l.wantedSessionType ?? null,
    status: l.status,
    follow_up_on: l.followUpOn ?? null,
    note: l.note ?? null,
    converted_client_id:
      l.convertedClientId === undefined ? null : (resolve("clients", l.convertedClientId) ?? null),
  }),
  fromRow: (r, unresolve) => ({
    name: r.name as string,
    phone: (r.phone as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    source: (r.source as Lead["source"]) ?? undefined,
    firstContact: iso(r.first_contact)!,
    interest: (r.interest as string) ?? undefined,
    wantedLocation: (r.wanted_location as Lead["wantedLocation"]) ?? undefined,
    wantedSessionType: (r.wanted_session_type as Lead["wantedSessionType"]) ?? undefined,
    status: r.status as Lead["status"],
    followUpOn: iso(r.follow_up_on),
    note: (r.note as string) ?? undefined,
    convertedClientId:
      r.converted_client_id === null || r.converted_client_id === undefined
        ? undefined
        : unresolve("clients", r.converted_client_id as number),
  }),
};

export const APPOINTMENTS: TableSpec<Appointment> = {
  local: "appointments",
  remote: "appointments",
  dependsOn: ["clients", "sessions"],
  toRow: (a, coachId, resolve) => {
    const client = resolve("clients", a.clientId);
    if (client === undefined) return null;
    return {
      coach_id: coachId,
      client_id: client,
      date: a.date,
      start_time: a.startTime,
      duration_minutes: a.durationMinutes,
      location: a.location,
      session_type: a.sessionType,
      status: a.status,
      group_id: a.groupId ?? null,
      session_id: a.sessionId === undefined ? null : (resolve("sessions", a.sessionId) ?? null),
      note: a.note ?? null,
    };
  },
  fromRow: (r, unresolve) => {
    const clientId = unresolve("clients", r.client_id as number);
    if (clientId === undefined) return null;
    return {
      clientId,
      date: iso(r.date)!,
      // Postgres hands back "09:30:00"; the input element wants "09:30".
      startTime: String(r.start_time ?? "09:00").slice(0, 5),
      durationMinutes: num(r.duration_minutes) || 60,
      location: r.location as Appointment["location"],
      sessionType: r.session_type as Appointment["sessionType"],
      status: r.status as Appointment["status"],
      groupId: (r.group_id as string) ?? undefined,
      sessionId:
        r.session_id === null || r.session_id === undefined
          ? undefined
          : unresolve("sessions", r.session_id as number),
      note: (r.note as string) ?? undefined,
    };
  },
};

/** Optional numbers: absent stays absent rather than becoming zero. */
const optNum = (v: unknown): number | undefined =>
  v === null || v === undefined || v === "" ? undefined : Number(v);

export const EVALUATIONS: TableSpec<Evaluation> = {
  local: "evaluations",
  remote: "evaluations",
  dependsOn: ["clients"],
  toRow: (e, coachId, resolve) => {
    const client = resolve("clients", e.clientId);
    if (client === undefined) return null;
    return {
      coach_id: coachId,
      client_id: client,
      date: e.date,
      weight_kg: e.weightKg ?? null,
      body_fat_pct: e.bodyFatPct ?? null,
      waist_cm: e.waistCm ?? null,
      chest_cm: e.chestCm ?? null,
      hip_cm: e.hipCm ?? null,
      arm_cm: e.armCm ?? null,
      thigh_cm: e.thighCm ?? null,
      goal: e.goal ?? null,
      note: e.note ?? null,
    };
  },
  fromRow: (r, unresolve) => {
    const clientId = unresolve("clients", r.client_id as number);
    if (clientId === undefined) return null;
    return {
      clientId,
      date: iso(r.date)!,
      weightKg: optNum(r.weight_kg),
      bodyFatPct: optNum(r.body_fat_pct),
      waistCm: optNum(r.waist_cm),
      chestCm: optNum(r.chest_cm),
      hipCm: optNum(r.hip_cm),
      armCm: optNum(r.arm_cm),
      thighCm: optNum(r.thigh_cm),
      goal: (r.goal as string) ?? undefined,
      note: (r.note as string) ?? undefined,
    };
  },
};

/**
 * Push order. Clients first because everything points at them; sessions before
 * transactions and appointments, because both reference a session.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SPECS: TableSpec<any>[] = [
  CLIENTS,
  PRICES,
  SESSIONS,
  TRANSACTIONS,
  APPOINTMENTS,
  EVALUATIONS,
  INFORM,
  INVOICES,
  LEADS,
];
