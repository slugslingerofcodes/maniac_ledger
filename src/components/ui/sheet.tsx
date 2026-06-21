"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root {...props} />
}

function SheetTrigger({ className, ...props }: SheetPrimitive.Trigger.Props) {
  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      className={className}
      {...props}
    />
  )
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-lg outline-none transition-transform duration-300 ease-in-out",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-border data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r border-border data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b border-border data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t border-border data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          className
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
}
