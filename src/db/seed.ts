import type { PriceItem, Settings } from "./schema";

/**
 * Tabel A of the PRIJZEN sheet, plus Online.
 *
 * Online was missing from the workbook entirely. Yens set it at €40 per hour;
 * that rate is applied flat across all three session types, and the 10-pack is
 * simply 10 × €40 with no volume discount and the same 4 months validity as
 * Privéruimte. Those two fill-ins are guesses — adjust on the Prijzen screen.
 */
export const DEFAULT_PRICES: PriceItem[] = [
  // Privéruimte — packs valid 4 months
  { code: "PR-SOLO-LOS", baseCode: "PR-SOLO-LOS", location: "Privéruimte", sessionType: "Solo", product: "Losse sessie", amount: 70, credits: 1, validityMonths: 0, active: true },
  { code: "PR-SOLO-10", baseCode: "PR-SOLO-10", location: "Privéruimte", sessionType: "Solo", product: "Pakket 10", amount: 650, credits: 10, validityMonths: 4, active: true },
  { code: "PR-DUO-LOS", baseCode: "PR-DUO-LOS", location: "Privéruimte", sessionType: "Duo", product: "Losse sessie", amount: 42, credits: 1, validityMonths: 0, active: true },
  { code: "PR-DUO-10", baseCode: "PR-DUO-10", location: "Privéruimte", sessionType: "Duo", product: "Pakket 10", amount: 400, credits: 10, validityMonths: 4, active: true },
  { code: "PR-SEMI-LOS", baseCode: "PR-SEMI-LOS", location: "Privéruimte", sessionType: "Semi PT", product: "Losse sessie", amount: 34, credits: 1, validityMonths: 0, active: true },
  { code: "PR-SEMI-10", baseCode: "PR-SEMI-10", location: "Privéruimte", sessionType: "Semi PT", product: "Pakket 10", amount: 320, credits: 10, validityMonths: 4, active: true },
  // Aan huis — packs valid 6 months
  { code: "AH-SOLO-LOS", baseCode: "AH-SOLO-LOS", location: "Aan huis", sessionType: "Solo", product: "Losse sessie", amount: 80, credits: 1, validityMonths: 0, active: true },
  { code: "AH-SOLO-10", baseCode: "AH-SOLO-10", location: "Aan huis", sessionType: "Solo", product: "Pakket 10", amount: 760, credits: 10, validityMonths: 6, active: true },
  { code: "AH-DUO-LOS", baseCode: "AH-DUO-LOS", location: "Aan huis", sessionType: "Duo", product: "Losse sessie", amount: 50, credits: 1, validityMonths: 0, active: true },
  { code: "AH-DUO-10", baseCode: "AH-DUO-10", location: "Aan huis", sessionType: "Duo", product: "Pakket 10", amount: 460, credits: 10, validityMonths: 6, active: true },
  { code: "AH-SEMI-LOS", baseCode: "AH-SEMI-LOS", location: "Aan huis", sessionType: "Semi PT", product: "Losse sessie", amount: 40, credits: 1, validityMonths: 0, active: true },
  { code: "AH-SEMI-10", baseCode: "AH-SEMI-10", location: "Aan huis", sessionType: "Semi PT", product: "Pakket 10", amount: 360, credits: 10, validityMonths: 6, active: true },
  // Online — flat €40/uur, packs valid 4 months
  { code: "ON-SOLO-LOS", baseCode: "ON-SOLO-LOS", location: "Online", sessionType: "Solo", product: "Losse sessie", amount: 40, credits: 1, validityMonths: 0, active: true },
  { code: "ON-SOLO-10", baseCode: "ON-SOLO-10", location: "Online", sessionType: "Solo", product: "Pakket 10", amount: 400, credits: 10, validityMonths: 4, active: true },
  { code: "ON-DUO-LOS", baseCode: "ON-DUO-LOS", location: "Online", sessionType: "Duo", product: "Losse sessie", amount: 40, credits: 1, validityMonths: 0, active: true },
  { code: "ON-DUO-10", baseCode: "ON-DUO-10", location: "Online", sessionType: "Duo", product: "Pakket 10", amount: 400, credits: 10, validityMonths: 4, active: true },
  { code: "ON-SEMI-LOS", baseCode: "ON-SEMI-LOS", location: "Online", sessionType: "Semi PT", product: "Losse sessie", amount: 40, credits: 1, validityMonths: 0, active: true },
  { code: "ON-SEMI-10", baseCode: "ON-SEMI-10", location: "Online", sessionType: "Semi PT", product: "Pakket 10", amount: 400, credits: 10, validityMonths: 4, active: true },
];

/**
 * Defaults for a fresh install.
 *
 * Business identity (name, address, company number, IBAN, e-mail) is
 * deliberately left blank: it is personal data and this file is committed.
 * The real values from the INSTELLINGEN sheet live in the gitignored
 * data/import-uit-excel.json, or get filled in on the Instellingen screen.
 */
export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  businessName: "",
  tradeName: "",
  address: "",
  companyNumber: "",
  vatNumber: "",
  iban: "",
  email: "",
  phone: "",
  paymentTermDays: 14,
  nextInvoiceNumber: "2026-001",
  vatNote:
    "Bijzondere vrijstellingsregeling voor kleine ondernemingen. Btw niet van toepassing (art. 56bis W.BTW).",

  informName: "",
  informAddress: "",
  informCompanyNumber: "",
  informEmail: "",
  // Tabel B of the PRIJZEN sheet — rates, not identifying data.
  informRates: { "Solo PT": 45, "Duo PT": 60, "Semi PT": 55, Andere: 0 },

  vatThreshold: 25000,
  vatSafetyMargin: 1500,
  warnRatio: 0.8,
  criticalRatio: 0.95,
  socialExemptionThreshold: 1922.16,
  socialMainOccupationThreshold: 17374.08,
  estimatedBusinessCosts: 5000,

  packExpiryWarningDays: 30,
  evaluationLookaheadDays: 14,
  inactiveDays: 30,
};
