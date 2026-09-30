import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { ONBOARDING_QUERY_KEY, onboardingApi } from "../api/onboarding";
import type { Onboarding, OnboardingStepKey } from "../api/types";

// Shared by the banner and the page: the checklist, refetched on every
// navigation while it's still open — a step usually gets done on some
// other page (uploading on /resume, applying from the board), and this is
// the one place that notices without every one of those pages having to.
export function useOnboarding() {
  const { user } = useAuth();
  const location = useLocation();
  const query = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: onboardingApi.get,
    enabled: !!user,
  });
  const isOpen = !!query.data && !query.data.completed_at && !query.data.dismissed_at;
  const { refetch } = query;
  // Only on an actual path change — not when isOpen first flips true as the
  // initial load lands, which would just fetch the same thing twice.
  const lastPathname = useRef(location.pathname);
  useEffect(() => {
    if (lastPathname.current === location.pathname) return;
    lastPathname.current = location.pathname;
    if (isOpen) refetch();
  }, [location.pathname, isOpen, refetch]);
  return query;
}

export function useDismissOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboardingApi.dismiss,
    onSuccess: (data) => queryClient.setQueryData(ONBOARDING_QUERY_KEY, data),
  });
}

// Getting started doubles as a tour: finishing a step for the first time,
// while the checklist is still open, carries the user on to the next step's
// page. This answers "is completing `key` right now that first time?" —
// read at click time (use it in a mutation's onMutate), before the action
// itself ticks the step off.
export function useIsTourStep() {
  const queryClient = useQueryClient();
  return (key: OnboardingStepKey): boolean => {
    const onboarding = queryClient.getQueryData<Onboarding>(ONBOARDING_QUERY_KEY);
    if (!onboarding || onboarding.completed_at || onboarding.dismissed_at) return false;
    return onboarding.steps.some((step) => step.key === key && !step.done);
  };
}
