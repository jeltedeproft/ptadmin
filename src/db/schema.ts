// Domain model ported from "Business Dossier.xlsx".
// Enum values are kept in Dutch exactly as they appear in the sheet's dropdowns,
// so data migrated from the workbook stays comparable.

export const CLIENT_STATUSES = ["Intake", "Actief", "Gepauzeerd", "Stopgezet"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const LOCATIONS = ["Privéruimte", "Aan huis"] as const;
export type Location = (typeof LOCATIONS)[number];

/** Session types that can be sold as a product (the PRIJZEN matrix covers these three). */
export const PRICED_SESSION_TYPES = ["Solo", "Duo", "Semi PT"] as const;
export type PricedSessionType = (typeof PRICED_SESSION_TYPES)[number];

/** Session types that can be logged (SESSIES allows more than what is sold). */
export const SESSION_TYPES = [
  "Solo",
  "Duo",
  "Semi PT",
  "Trio",
  "Quattro",
  "Drop-in",
  "Intake",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/**
 * What can go in the agenda. Everything a session can be, plus two that only
 * exist as an appointment:
 *
 *   Intake      — a first meeting. Becomes a session, but never costs a credit.
 *   Persoonlijk — time blocked for himself. No client, and it never becomes a
 *                 session at all.
 */
export const APPOINTMENT_TYPES = [...SESSION_TYPES, "Persoonlijk"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

/**
 * Duration follows the type instead of being typed in every time: an hour for
 * a training, half an hour for an intake. Only a personal block varies, so
 * that is the only one with a field.
 */
export function defaultDuration(type: AppointmentType): number {
  if (type === "Intake") return 30;
  if (type === "Persoonlijk") return 60;
  return 60;
}

export function hasEditableDuration(type: AppointmentType): boolean {
  return type === "Persoonlijk";
}

/** A personal block belongs to nobody. */
export function needsClient(type: AppointmentType): boolean {
  return type !== "Persoonlijk";
}

export const PRODUCTS = ["Losse sessie", "Pakket 10"] as const;
export type Product = (typeof PRODUCTS)[number];

export const SESSION_STATUSES = [
  "Uitgevoerd",
  "Te laat geannuleerd",
  "Geannuleerd op tijd",
  "Niet verschenen",
  "Niet aangerekend",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const INVOICE_STATUSES = [
  "Concept",
  "Gegenereerd",
  "Verzonden",
  "Betaald",
  "Te laat",
  "Geannuleerd",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TYPES = ["Eigen klant", "IN FORM"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const PAYMENT_METHODS = ["Bancontact Pay", "Overschrijving", "Cash", "Andere"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INFORM_SESSION_TYPES = ["Solo PT", "Duo PT", "Semi PT", "Andere"] as const;
export type InformSessionType = (typeof INFORM_SESSION_TYPES)[number];

/** ISO date string, `YYYY-MM-DD`. Stored as text so IndexedDB indexes sort chronologically. */
export type IsoDate = string;

export const LEAD_STATUSES = [
  "Nieuw",
  "Gecontacteerd",
  "Kennismaking gepland",
  "Intake gepland",
  "Voorstel verstuurd",
  "Klant geworden",
  "Geen interesse",
  "Later opvolgen",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "Doorverwijzing",
  "Instagram",
  "Facebook",
  "Website",
  "IN FORM",
  "Andere",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** A prospect, tracked before they become a client. */
export interface Lead {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  source?: LeadSource;
  firstContact: IsoDate;
  interest?: string;
  wantedLocation?: Location;
  wantedSessionType?: PricedSessionType;
  status: LeadStatus;
  followUpOn?: IsoDate;
  note?: string;
  /** Set once converted, so the lead history stays linked to the client. */
  convertedClientId?: number;
}

export interface Client {
  id?: number;
  name: string;
  /** Who the invoice is addressed to, when that differs from the person —
   *  a client's company rather than their own name. Falls back to `name`. */
  billingName?: string;
  birthDate?: IsoDate;
  status: ClientStatus;
  startDate: IsoDate;
  location: Location;
  /** Waar deze klant naartoe werkt — staat op de klantkaart. */
  goal?: string;
  lastEvaluation?: IsoDate;
  nextEvaluation?: IsoDate;
  email?: string;
  phone?: string;
  billingAddress?: string;
  companyNumber?: string;
  note?: string;

  /**
   * Consent, recorded rather than assumed.
   *
   * Health details — injuries, medication, contra-indications — are a special
   * category under GDPR. Asking at the start is not enough: it has to be
   * demonstrable afterwards, which means storing when it was given and which
   * text was agreed to. Withdrawal clears the date.
   */
  consentHealthOn?: IsoDate;
  consentHealthVersion?: string;
  consentPhotosOn?: IsoDate;
  consentPhotosVersion?: string;
}

/**
 * A row of the PRIJZEN matrix: location × session type × product.
 *
 * Prices are versioned rather than overwritten. `baseCode` is the stable
 * productcode ("PR-SOLO-10"); `code` identifies one priced period of it
 * ("PR-SOLO-10@2027-01-01"). A transaction stores the versioned `code`, so a
 * later price change never rewrites what an old sale cost.
 */
export interface PriceItem {
  code: string;
  baseCode: string;
  location: Location;
  sessionType: PricedSessionType;
  product: Product;
  amount: number;
  credits: number;
  validityMonths: number; // 0 = no expiry (single sessions)
  /** Inclusive. Absent means "has always applied". */
  activeFrom?: IsoDate;
  /** Inclusive. Absent means "still applies". */
  activeUntil?: IsoDate;
  active: boolean;
  note?: string;
}

/** A purchase: converts money into credits with an expiry date. */
export interface Transaction {
  id?: number;
  date: IsoDate;
  clientId: number;
  location: Location;
  sessionType: PricedSessionType;
  product: Product;
  productCode: string;
  creditsBought: number;
  amount: number;
  validityMonths: number;
  expiresOn?: IsoDate; // derived: date + validityMonths, absent when validityMonths === 0
  paid: boolean;
  paidOn?: IsoDate;
  paymentMethod?: PaymentMethod;
  invoiceNeeded: boolean;
  invoiceNumber?: string;
  /**
   * Losse sessies only (mogelijkheid B): the one session this purchase pays
   * for. A loose sale is tied to its session and never joins the free credit
   * balance. Left empty until the session is logged.
   */
  sessionId?: number;
  note?: string;
}

/** A delivered (or cancelled) session. Burns credits depending on `status`. */
export interface Session {
  id?: number;
  date: IsoDate;
  clientId: number;
  location: Location;
  sessionType: SessionType;
  status: SessionStatus;
  /** Shared reference (e.g. "G0041") tying one group training's records together. */
  groupId?: string;
  note?: string;
}

/**
 * One evaluation moment. Measurements are all optional — Yens will not always
 * take every one, and a half-filled evaluation is still worth recording.
 */
export interface Evaluation {
  id?: number;
  clientId: number;
  date: IsoDate;
  weightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  chestCm?: number;
  hipCm?: number;
  armCm?: number;
  thighCm?: number;
  /** What this period is working towards. */
  goal?: string;
  note?: string;
}

/** The measurable fields, for tables and progress comparisons. */
export const MEASURES = [
  { key: "weightKg", label: "Gewicht", unit: "kg", lowerIsBetter: true },
  { key: "bodyFatPct", label: "Vetpercentage", unit: "%", lowerIsBetter: true },
  { key: "waistCm", label: "Taille", unit: "cm", lowerIsBetter: true },
  { key: "chestCm", label: "Borst", unit: "cm", lowerIsBetter: false },
  { key: "hipCm", label: "Heup", unit: "cm", lowerIsBetter: true },
  { key: "armCm", label: "Arm", unit: "cm", lowerIsBetter: false },
  { key: "thighCm", label: "Bovenbeen", unit: "cm", lowerIsBetter: false },
] as const;

export type MeasureKey = (typeof MEASURES)[number]["key"];

export const APPOINTMENT_STATUSES = ["Gepland", "Afgezegd"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * A planned training, before it happens.
 *
 * One row per participant sharing a groupId, exactly as sessions work — so a
 * duo is two appointments, and each person can cancel independently. Ticking
 * one off creates the Session that actually consumes the credit; until then
 * nothing is charged.
 */
export interface Appointment {
  id?: number;
  date: IsoDate;
  /** "09:30", local time. */
  startTime: string;
  durationMinutes: number;
  /** Absent for a personal block. */
  clientId?: number;
  location: Location;
  sessionType: AppointmentType;
  status: AppointmentStatus;
  groupId?: string;
  /** Set once logged as done; points at the session it became. */
  sessionId?: number;
  note?: string;
}

/** Hourly work billed to IN FORM Kontich — a second revenue stream, invoiced monthly. */
export interface InformEntry {
  id?: number;
  date: IsoDate;
  sessionType: InformSessionType;
  clientOrGroup?: string;
  hours: number;
  hourlyRate: number;
  amount: number; // hours × hourlyRate
  invoiced: boolean;
  invoiceNumber?: string;
  note?: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id?: number;
  number: string; // e.g. "2026-001"
  date: IsoDate;
  dueDate: IsoDate;
  type: InvoiceType;
  clientId?: number; // absent for IN FORM invoices
  recipientName: string;
  recipientAddress?: string;
  recipientEmail?: string;
  lines: InvoiceLine[];
  /** Always 0 under the art. 56bis exemption, but stored so the line is explicit. */
  vatAmount: number;
  amount: number;
  status: InvoiceStatus;
  paidOn?: IsoDate;
  sentOn?: IsoDate;
  reminderSentOn?: IsoDate;
  /** Ids of the transactions / inform entries this invoice was generated from. */
  sourceType: "transaction" | "inform";
  sourceIds: number[];
  note?: string;
}

export interface Settings {
  id: number; // always 1 — single settings row
  businessName: string;
  tradeName: string;
  address: string;
  companyNumber: string;
  /** BTW-nummer as printed on the invoice, e.g. "BE0123.456.789". */
  vatNumber: string;
  iban: string;
  email: string;
  phone: string;
  /** Number clients reach him on. Used for the WhatsApp button. */
  whatsappNumber: string;
  /** Logo for the invoice header, stored as a data: URI. Falls back to the trade name. */
  logoDataUrl?: string;
  paymentTermDays: number;
  nextInvoiceNumber: string;
  vatNote: string;

  informName: string;
  informAddress: string;
  informCompanyNumber: string;
  informEmail: string;
  informRates: Record<InformSessionType, number>;

  // Belgian thresholds — see src/domain/thresholds.ts
  vatThreshold: number;
  vatSafetyMargin: number;
  warnRatio: number;
  criticalRatio: number;
  socialExemptionThreshold: number;
  socialMainOccupationThreshold: number;
  estimatedBusinessCosts: number;

  /**
   * The consent texts, and the version stamped onto a client when they agree.
   * Bump the version whenever the wording changes materially — old consents
   * then visibly refer to the old text instead of silently inheriting the new.
   */
  consentVersion: string;
  consentHealthText: string;
  consentPhotosText: string;

  /** Days before a pack expires that it should start showing up as an alert. */
  packExpiryWarningDays: number;
  /** Days ahead to look when listing upcoming evaluations. */
  evaluationLookaheadDays: number;
  /** Flag a client who has not trained for this many days. */
  inactiveDays: number;

  /** Access code. Absent means the app opens without one. See domain/lock.ts. */
  accessCodeHash?: string;
  accessCodeSalt?: string;
  /** Re-ask for the code after this many minutes away from the app. */
  lockAfterMinutes: number;
}
