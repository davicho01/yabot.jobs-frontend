// Misspellings of the big consumer email domains, seen or near-certain.
// A sign-in link sent to a typo'd domain never arrives, so these were a
// real (if small) share of sign-in drop-off: e.g. gamil.com, sbcglobsl.net.
const DOMAIN_TYPOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmsil.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icoud.com": "icloud.com",
  "aol.co": "aol.com",
  "aol.con": "aol.com",
  "sbcglobsl.net": "sbcglobal.net",
  "sbcgloabl.net": "sbcglobal.net",
  "sbcglobal.com": "sbcglobal.net",
};

// The corrected address when the domain is a known misspelling, else null.
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = DOMAIN_TYPOS[email.slice(at + 1).trim().toLowerCase()];
  return fixed ? `${email.slice(0, at)}@${fixed}` : null;
}
