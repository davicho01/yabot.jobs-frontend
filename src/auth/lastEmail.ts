// The email of the last account signed in on this device, filled in on the
// email sign-in form next time so a returning user only taps "Email me a
// code". Best-effort: storage can be blocked (private mode).
const LAST_EMAIL_KEY = "yabot.signIn.lastEmail";

export function lastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // Blocked: they'll just type it again.
  }
}
