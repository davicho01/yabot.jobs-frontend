import { useEffect, useRef } from "react";
import { GOOGLE_CLIENT_ID, loadGsi } from "../auth/google";

// Google's own "Continue with Google" button (their branding rules require
// rendering it through GSI). onCredential gets the ID token to POST to
// /auth/google. Renders nothing when VITE_GOOGLE_CLIENT_ID is unset.
export function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // GSI keeps the callback from initialize(); a ref keeps it pointing at the
  // latest onCredential without re-rendering the button.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const clientId = GOOGLE_CLIENT_ID;
    let cancelled = false;
    loadGsi()
      .then((google) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => onCredentialRef.current(credential),
        });
        google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          // GSI takes a pixel width (max 400), not "100%".
          width: Math.min(container.offsetWidth || 316, 400),
        });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={containerRef} className="google-sign-in" />;
}
