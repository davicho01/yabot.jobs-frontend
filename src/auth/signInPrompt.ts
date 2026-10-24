import { createContext, useContext } from "react";
import type { JobDetail } from "../api/types";

// A page that wants "Apply ↗" to sign in on the spot (SignInModal), instead
// of going to /login, provides this (the phone swipe board does).
// CompanySiteLink calls it with the job when someone signed out taps the link.
export const SignInPromptContext = createContext<((job: JobDetail) => void) | null>(null);

export function useSignInPrompt() {
  return useContext(SignInPromptContext);
}
