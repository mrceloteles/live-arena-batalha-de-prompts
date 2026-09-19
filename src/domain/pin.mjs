/**
 * Numeric room PINs (Kahoot-style): 6 digits, easy to read aloud and type.
 * Only digits are kept from user input so "483 217" and "483-217" both work.
 */

export const PIN_LENGTH = 6;

export function normalizePin(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

export function isValidPin(value) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(value ?? ''));
}

export function randomPin() {
  const digits = [];
  digits.push(String(1 + Math.floor(Math.random() * 9))); // nunca comeca com zero
  for (let i = 1; i < PIN_LENGTH; i += 1) {
    digits.push(String(Math.floor(Math.random() * 10)));
  }
  return digits.join('');
}

/** "483217" -> "483 217" (formatacao de exibicao, ex.: cartao do host). */
export function formatPin(pin) {
  const digits = normalizePin(pin);
  if (!isValidPin(digits)) return String(pin ?? '');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}
