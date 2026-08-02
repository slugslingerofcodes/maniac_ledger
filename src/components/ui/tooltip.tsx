"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Tooltips for icon-only controls.
 *
 * Wrap the control, don't replace it — `render` makes the trigger *become* the
 * child element, so the button keeps its own styling, handlers and ref:
 *
 *     <Tooltip label="Remove from library">
 *       <button aria-label="Remove from library">…</button>
 *     </Tooltip>
 *
 * A tooltip is never the only label: the child must still carry its own
 * `aria-label`/text, because tooltips don't exist for touch or screen readers.
 * `TooltipProvider` (mounted once in the root layout) shares the open delay, so
 * moving along a row of icons shows the rest instantly instead of re-waiting.
 */
function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={350} closeDelay={0} {...props} />
}

function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  disabled,
}: {
  /** Short text — a few words. Longer copy belongs in the UI itself. */
  label: React.ReactNode
  /** The control being labelled. Must be a single element. */
  children: React.ReactElement
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  sideOffset?: number
  disabled?: boolean
}) {
  if (disabled) return children

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="z-50"
        >
          <TooltipPrimitive.Popup
            data-slot="tooltip"
            className={cn(
              "max-w-56 origin-[var(--transform-origin)] rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md outline-none",
              "transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
