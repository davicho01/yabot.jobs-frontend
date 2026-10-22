// Same OAuth client ID as the backend's GOOGLE_CLIENT_ID. Unset (local dev
// without one, or before prod is configured) means no Google button at all.
export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Just the slice of Google Identity Services GoogleSignInButton uses.
export interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let gsiScript: Promise<GoogleIdentity> | null = null;

// Loaded on first use only, so pages without the button never fetch it.
export function loadGsi(): Promise<GoogleIdentity> {
  gsiScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("GSI missing")));
    script.onerror = () => {
      gsiScript = null;
      reject(new Error("Failed to load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return gsiScript;
}
