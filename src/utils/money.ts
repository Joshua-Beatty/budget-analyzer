/**
 * Money helpers for converting between SimpleFIN decimal-string amounts and
 * integer minor units ("cents").
 *
 * Money is stored in the database as an integer number of cents (fixed scale
 * of 2) to avoid IEEE-754 floating-point rounding errors. Conversion is done
 * by string parsing — never `value * 100` — so it is exact for the common
 * 2-decimal case.
 *
 * Scale-2 tradeoff: SimpleFIN amounts are arbitrary-precision decimal strings,
 * and a few currencies (and custom currencies) use more than 2 decimal places.
 * Fractional digits beyond the second are **truncated** here. This is an
 * accepted limitation of the fixed scale-2 representation.
 *
 * @see https://www.simplefin.org/protocol.html#transaction
 */

/** Number of decimal places represented by the integer cents value. */
const SCALE = 2;

/**
 * Convert a decimal money string (e.g. `"-33293.43"`) to integer cents
 * (`-3329343`).
 *
 * Parsing is purely string-based to stay exact; digits past two decimal places
 * are truncated (see module docs).
 *
 * @param value a numeric string such as `"100"`, `"-33293.43"`, or `"1.5"`.
 * @returns the value as an integer number of cents.
 * @throws {RangeError} when `value` is not a valid numeric string.
 */
export function toCents(value: string): number {
  const trimmed = value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(trimmed);
  if (match === null) {
    throw new RangeError(`Invalid money value: ${JSON.stringify(value)}`);
  }

  const [, sign, whole, fraction = ""] = match;
  // Pad/truncate the fractional part to exactly SCALE digits.
  const cents = fraction.slice(0, SCALE).padEnd(SCALE, "0");
  const magnitude = Number.parseInt(`${whole}${cents}`, 10);

  return sign === "-" ? -magnitude : magnitude;
}

/**
 * Format integer cents (`-3329343`) back to a decimal money string
 * (`"-33293.43"`).
 *
 * @param cents an integer number of cents.
 * @returns the value as a fixed-2-decimal string, signed for negatives.
 * @throws {RangeError} when `cents` is not an integer.
 */
export function fromCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Expected integer cents, got: ${cents}`);
  }

  const negative = cents < 0;
  const magnitude = Math.abs(cents);
  const whole = Math.trunc(magnitude / 100);
  const fraction = (magnitude % 100).toString().padStart(SCALE, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
