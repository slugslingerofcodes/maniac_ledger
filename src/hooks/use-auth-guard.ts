"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "./use-user";

/**
 * Client-side route guard. Redirects to `redirectTo` once we know the visitor
 * is signed out.
 *
 * The proxy (src/proxy.ts) is the real gate on initial navigation; this keeps
 * Client Components reactive to auth changes that happen after the page loads
 * (e.g. the session expires or the user signs out in another tab).
 *
 * @example
 * function Protected() {
 *   const { user, loading } = useAuthGuard();
 *   if (loading || !user) return <Spinner />;
 *   return <Dashboard user={user} />;
 * }
 */
export function useAuthGuard(redirectTo = "/login") {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [user, loading, router, redirectTo]);

  return { user, loading };
}
