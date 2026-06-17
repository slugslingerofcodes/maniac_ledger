"use client";

import { useTransition } from "react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

type LogoutButtonProps = {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
};

/**
 * Signs the user out via the `signOut` Server Action (which clears the auth
 * cookies and redirects to /login). Shows a pending state while in flight.
 */
export function LogoutButton({
  variant = "outline",
  size = "sm",
  className,
}: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
