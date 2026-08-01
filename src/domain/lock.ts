/**
 * Access code for the app.
 *
 * What this protects: someone picking up an unlocked phone or laptop and
 * opening the app. That is the realistic risk for a trainer whose device sits
 * in a gym.
 *
 * What it does NOT protect: the data itself. Records stay unencrypted in
 * IndexedDB, so anyone with the device and browser devtools can still read
 * them. Real protection at rest would mean encrypting every record with a key
 * derived from the code — and losing the code would then mean losing the data.
 * Device encryption plus a screen lock is the stronger answer for that.
 */

const UNLOCK_KEY = "ptadmin.unlocked";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

/**
 * PBKDF2-SHA256. A four-digit code is trivially brute-forceable regardless, but
 * stretching keeps the stored value from being a plain lookup.
 */
export async function hashCode(code: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 200_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

/** Constant-time-ish comparison, so a wrong code leaks nothing by timing. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCode(code: string, salt: string, expected: string): Promise<boolean> {
  return sameHash(await hashCode(code, salt), expected);
}

/** Unlocked state lives in sessionStorage, and expires after `minutes` away. */
export function markUnlocked(): void {
  sessionStorage.setItem(UNLOCK_KEY, String(Date.now()));
}

export function isUnlocked(minutes: number): boolean {
  const at = Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0);
  if (!at) return false;
  return Date.now() - at < minutes * 60_000;
}

export function lockNow(): void {
  sessionStorage.removeItem(UNLOCK_KEY);
}
