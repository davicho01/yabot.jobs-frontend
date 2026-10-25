import { createContext, useContext } from "react";
import type { JobDetail } from "../api/types";

// Opens the sign-in window (SignInModal) for a job, so a signed-out "Apply ↗"
// signs in on the spot instead of going to /login. Provided around the whole
// app by SignInPromptProvider; CompanySiteLink calls it with the job.
export const SignInPromptContext = createContext<((job: JobDetail) => void) | null>(null);

export function useSignInPrompt() {
  return useContext(SignInPromptContext);
}
