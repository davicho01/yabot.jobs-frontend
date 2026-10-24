import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { authApi } from "../api/auth";
import { rememberEmail } from "./lastEmail";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<User>;
  verify: (token: string) => Promise<User>;
  signInWithGoogle: (credential: string) => Promise<User>;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string | null) => Promise<User>;
  updateEmailAlertsEnabled: (enabled: boolean) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  // Jobs fetched signed out came without their employer links; signing in
  // refetches them, so Apply ↗ has somewhere to go.
  const signedIn = useCallback(
    (signedInUser: User) => {
      setUser(signedInUser);
      rememberEmail(signedInUser.email);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error("Failed to load current user", err);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const requestCode = useCallback(async (email: string) => {
    await authApi.requestCode(email);
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const { user: signedInUser } = await authApi.verifyCode(email, code);
      signedIn(signedInUser);
      return signedInUser;
    },
    [signedIn],
  );

  const verify = useCallback(async (token: string) => {
    const { user: verifiedUser } = await authApi.verify(token);
    signedIn(verifiedUser);
    return verifiedUser;
  }, [signedIn]);

  const signInWithGoogle = useCallback(async (credential: string) => {
    const { user: signedInUser } = await authApi.google(credential);
    signedIn(signedInUser);
    return signedInUser;
  }, [signedIn]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    // Drops everything fetched as them (their applications and scores,
    // employer links), which queries switched off when signed out would
    // otherwise keep showing; the rest refetches signed out.
    queryClient.resetQueries();
  }, [queryClient]);

  const updateDisplayName = useCallback(async (displayName: string | null) => {
    const updatedUser = await authApi.updateMe({ display_name: displayName });
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const updateEmailAlertsEnabled = useCallback(async (enabled: boolean) => {
    const updatedUser = await authApi.updateMe({ email_alerts_enabled: enabled });
    setUser(updatedUser);
    return updatedUser;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        requestCode,
        verifyCode,
        verify,
        signInWithGoogle,
        logout,
        updateDisplayName,
        updateEmailAlertsEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
