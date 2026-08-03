/**
 * WhatsApp as the contact channel, instead of a chat inside the app.
 *
 * The reasoning is Yens': an in-app inbox quietly promises 24/7 availability,
 * and it is another place to check. WhatsApp is where both sides already are,
 * it keeps the history on their own phones, and it costs nothing to run.
 *
 * A wa.me link needs the number in international form with no plus, no spaces
 * and no leading zero — "+32 499 00 74 86" has to become "32499007486". Getting
 * that wrong opens WhatsApp on a blank screen, which looks like the app is
 * broken, so it is worth doing carefully.
 */

/** Belgium. Numbers written nationally are assumed to be local. */
export const DEFAULT_COUNTRY = "32";

/**
 * Normalises a phone number to what wa.me expects.
 * Returns null when there is nothing usable, so the caller can hide the button
 * rather than offer a link that goes nowhere.
 */
export function toWhatsAppNumber(raw: string | undefined, country = DEFAULT_COUNTRY): string | null {
  if (!raw) return null;

  // "+32 (0)470 …" — the bracketed zero is the national trunk prefix, which is
  // dropped as soon as a country code is present. Leaving it in produces
  // 320470… and a dead link, so it goes before the digits are extracted.
  const trimmed = raw.trim().replace(/\(\s*0\s*\)/g, "");
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // 0032… — the written-out international prefix.
  if (!hadPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!hadPlus && digits.startsWith("0")) {
    // 0494… — national notation, so prepend the country.
    digits = country + digits.slice(1);
  }

  // Too short to be a real number even in the shortest country.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function whatsAppLink(raw: string | undefined, message?: string, country = DEFAULT_COUNTRY): string | null {
  const number = toWhatsAppNumber(raw, country);
  if (!number) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${query}`;
}

/** Opening line so the client knows who is writing and about what. */
export function coachToClientMessage(clientFirstName: string, businessName: string): string {
  return `Dag ${clientFirstName}, ${businessName} hier.`;
}

export function clientToCoachMessage(clientName: string): string {
  return `Dag, ${clientName} hier. Ik heb een vraag over mijn training.`;
}
