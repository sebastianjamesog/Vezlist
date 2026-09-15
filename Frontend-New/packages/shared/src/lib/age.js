/**
 * The age gate's stored answer, as pure functions — no React, no storage, so
 * the one rule that decides "let them in or not" can be tested without
 * mounting anything.
 *
 * This file used to do date-of-birth arithmetic: a leap-year-safe,
 * timezone-safe `parseISODate` / `ageInYears` / `isAdult`, because the gate
 * asked for a birth date and recomputed the age from it on every read rather
 * than trusting a flag. The gate now asks a single yes/no question instead, so
 * there is no date to compute anything from and those three functions had no
 * caller left. They are in the history if a later build asks for a date again.
 *
 * BE CLEAR ABOUT WHAT IS LEFT: a boolean in this origin's localStorage. That
 * is weaker than what it replaced — one edited value in devtools now opens the
 * door, where before it also took a plausible adult birth date — and it was
 * never a legal control in either shape: no ID is uploaded or checked against
 * anything, and no jurisdiction is blocked. It is the declaration an adult
 * site is expected to make, remembered so it is not asked on every visit. Real
 * identity verification is a server's job and remains out of scope (#13).
 */

export const MIN_AGE = 18;

/**
 * Whether a value read back out of storage is an age-gate confirmation.
 *
 * Still validated rather than trusted on sight, for the shapes that can
 * actually turn up: a string, an array, `null`, a value written by an older
 * build. Anything that is not a plain object carrying `confirmed: true` fails
 * exactly the way a value that was never written fails — by showing the gate
 * again. Fail-closed is the only direction that is ever right here.
 *
 * A confirmation stored by the date-of-birth version of this gate
 * (`{ confirmed: true, dob }`) still passes, which is deliberate: those
 * visitors answered the harder question and should not be asked the easier
 * one again.
 */
export function isConfirmedAdult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.confirmed === true;
}
