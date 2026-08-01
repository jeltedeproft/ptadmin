import type { IsoDate, Location, PriceItem, PricedSessionType, Product } from "../db/schema";
import { addDays, today } from "./dates";

const LOCATION_PREFIX: Record<Location, string> = {
  Privéruimte: "PR",
  "Aan huis": "AH",
  Online: "ON",
};

const TYPE_PART: Record<PricedSessionType, string> = {
  Solo: "SOLO",
  Duo: "DUO",
  "Semi PT": "SEMI",
};

const PRODUCT_PART: Record<Product, string> = {
  "Losse sessie": "LOS",
  "Pakket 10": "10",
};

/**
 * Rebuilds the productcode the way the TRANSACTIES sheet did:
 * location prefix + session type + product.
 */
export function buildProductCode(
  location: Location,
  sessionType: PricedSessionType,
  product: Product,
): string {
  return `${LOCATION_PREFIX[location]}-${TYPE_PART[sessionType]}-${PRODUCT_PART[product]}`;
}

/** True when `price` was the applicable version on `onDate`. */
export function appliesOn(price: PriceItem, onDate: IsoDate): boolean {
  if (price.activeFrom && onDate < price.activeFrom) return false;
  if (price.activeUntil && onDate > price.activeUntil) return false;
  return true;
}

/**
 * The price that applied on `onDate` for this combination. Defaults to today,
 * so registering a back-dated sale picks up the tariff of that moment rather
 * than the current one.
 */
export function findPrice(
  prices: PriceItem[],
  location: Location,
  sessionType: PricedSessionType,
  product: Product,
  onDate: IsoDate = today(),
): PriceItem | undefined {
  const baseCode = buildProductCode(location, sessionType, product);
  const candidates = prices.filter((p) => p.baseCode === baseCode && appliesOn(p, onDate));
  // Prefer the most recently started version when windows overlap.
  return candidates.sort((a, b) => (b.activeFrom ?? "").localeCompare(a.activeFrom ?? ""))[0];
}

/** All versions of one productcode, newest first. */
export function priceHistory(prices: PriceItem[], baseCode: string): PriceItem[] {
  return prices
    .filter((p) => p.baseCode === baseCode)
    .sort((a, b) => (b.activeFrom ?? "").localeCompare(a.activeFrom ?? ""));
}

/**
 * Closes the running version the day before `from` and opens a new one.
 * Returns the records to write; the caller persists them together.
 */
export function repriceItem(
  current: PriceItem,
  amount: number,
  from: IsoDate,
): { closed: PriceItem; opened: PriceItem } {
  return {
    closed: { ...current, active: false, activeUntil: addDays(from, -1) },
    opened: {
      ...current,
      code: `${current.baseCode}@${from}`,
      amount,
      activeFrom: from,
      activeUntil: undefined,
      active: true,
    },
  };
}
