import type { Location, PriceItem, PricedSessionType, Product } from "../db/schema";

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

export function findPrice(
  prices: PriceItem[],
  location: Location,
  sessionType: PricedSessionType,
  product: Product,
): PriceItem | undefined {
  const code = buildProductCode(location, sessionType, product);
  return prices.find((p) => p.code === code && p.active);
}
