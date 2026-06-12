/**
 * Phonetic backend contract — a function that reduces a name to a phonetic key.
 * Language-specific implementations (Tamil, Telugu, Spanish soundex variants,
 * Hindi Devanagari-aware) can register via `registerPhoneticBackend` without
 * changing callers. Keep the output deterministic and ≤ 16 chars.
 */
export type PhoneticBackend = (name: string) => string;

/** English-leaning simplified metaphone. Used as the default for 'en' and as
 *  the fallback when no language-specific backend is registered. */
export function englishMetaphone(name: string): string {
  // Normalize to ASCII-safe base for phonetic matching
  let key = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const firstLetter = key.charAt(0);
  key = firstLetter + key.slice(1).replace(/[aeiou]/g, '');
  key = key
    .replace(/ph/g, 'f')
    .replace(/gh/g, 'g')
    .replace(/kn/g, 'n')
    .replace(/wr/g, 'r')
    .replace(/ck/g, 'k')
    .replace(/ch/g, 'x')
    .replace(/sh/g, 'x')
    .replace(/th/g, 't')
    .replace(/wh/g, 'w')
    .replace(/[^a-z]/g, '');
  return key.substring(0, 8);
}

/**
 * Language-keyed registry. Initialized with English only; other languages
 * fall back to English metaphone until a backend is registered. Adding
 * e.g. a Tamil backend is a single call: `registerPhoneticBackend('ta', fn)`.
 */
const phoneticBackends = new Map<string, PhoneticBackend>([
  ['en', englishMetaphone],
]);

/** Register a phonetic backend for a specific language code (e.g. 'hi', 'ta'). */
export function registerPhoneticBackend(language: string, backend: PhoneticBackend): void {
  phoneticBackends.set(language.toLowerCase(), backend);
}

/** Resolve the backend for a language, falling back to English metaphone. */
export function getPhoneticBackend(language?: string): PhoneticBackend {
  if (!language) return englishMetaphone;
  return phoneticBackends.get(language.toLowerCase()) ?? englishMetaphone;
}
