/**
 * Turns a thrown value into something a person can act on.
 *
 * Server errors and validation messages are already written for humans and are
 * kept verbatim. Framework and keychain failures are not: "x.default.getValue
 * is not a function" tells the person nothing and exposes an implementation
 * detail, so those become a plain fallback sentence.
 */
const INTERNAL = /(\.default\.|is not a function|undefined is not|Cannot read propert|getValueWithKeyAsync|getItemAsync|Native module)/i;

export function readableError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || INTERNAL.test(message)) return fallback;
  return message;
}
