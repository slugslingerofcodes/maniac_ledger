"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ShoppingBagIcon } from "lucide-react";
import { toast } from "sonner";

import { cancelMyRequest, requestProduct } from "@/app/actions/store";
import { Button } from "@/components/ui/button";

/**
 * "Request this item" button on a store product. Toggles to a "Requested"
 * state the user can cancel; the request itself surfaces on the admin
 * dashboard. Disabled when the product is unavailable.
 */
export function RequestButton({
  productId,
  available,
  initialRequested,
}: {
  productId: string;
  available: boolean;
  initialRequested: boolean;
}) {
  const [requested, setRequested] = useState(initialRequested);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!available) {
    return (
      <Button type="button" size="sm" variant="secondary" className="w-full" disabled>
        Unavailable
      </Button>
    );
  }

  function toggle() {
    startTransition(async () => {
      const res = requested
        ? await cancelMyRequest(productId)
        : await requestProduct(productId);
      if (res.ok) {
        setRequested(!requested);
        toast.success(requested ? "Request cancelled." : "Request sent to the store.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={requested ? "secondary" : "default"}
      className="w-full"
      disabled={pending}
      onClick={toggle}
    >
      {requested ? (
        <>
          <CheckIcon className="mr-1.5 size-3.5" /> Requested
        </>
      ) : (
        <>
          <ShoppingBagIcon className="mr-1.5 size-3.5" /> Request
        </>
      )}
    </Button>
  );
}
