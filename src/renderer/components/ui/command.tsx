"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Command palette primitive (Cmd-K).
 *
 * Composes Base UI Dialog with a filterable, keyboard-navigable list.
 * Designed for action launchers — not for selecting/submitting form values.
 *
 * Usage:
 *   <CommandDialog open={open} onOpenChange={setOpen}>
 *     <CommandInput placeholder="Type a command..." />
 *     <CommandList>
 *       <CommandGroup heading="Persona">
 *         <CommandItem value="senior engineer" onSelect={...}>Senior Engineer</CommandItem>
 *       </CommandGroup>
 *     </CommandList>
 *   </CommandDialog>
 */

interface CommandContextValue {
  query: string
  setQuery: (q: string) => void
  highlightedId: string | null
  setHighlightedId: (id: string | null) => void
  registerItem: (id: string, value: string) => () => void
  visibleIds: string[]
  onClose: () => void
}

const CommandContext = React.createContext<CommandContextValue | null>(null)

function useCommand() {
  const ctx = React.useContext(CommandContext)
  if (!ctx) throw new Error("Command parts must be used inside <CommandDialog>")
  return ctx
}

interface CommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  /** Title for screen readers. Visually hidden. */
  label?: string
}

export function CommandDialog({ open, onOpenChange, children, label = "Command palette" }: CommandDialogProps) {
  const [query, setQuery] = React.useState("")
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ReadonlyMap<string, string>>(() => new Map())

  const registerItem = React.useCallback((id: string, value: string) => {
    setItems((prev) => {
      const next = new Map(prev)
      next.set(id, value)
      return next
    })
    return () => {
      setItems((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  // Reset query each time the palette opens
  React.useEffect(() => {
    if (open) {
      setQuery("")
      setHighlightedId(null)
    }
  }, [open])

  const visibleIds = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = Array.from(items.entries())
    if (!q) return all.map(([id]) => id)
    return all
      .filter(([, value]) => value.toLowerCase().includes(q))
      .map(([id]) => id)
  }, [query, items])

  // Keep highlight on a visible item
  React.useEffect(() => {
    if (visibleIds.length === 0) {
      setHighlightedId(null)
      return
    }
    if (!highlightedId || !visibleIds.includes(highlightedId)) {
      setHighlightedId(visibleIds[0])
    }
  }, [visibleIds, highlightedId])

  const onClose = React.useCallback(() => onOpenChange(false), [onOpenChange])

  const ctx = React.useMemo<CommandContextValue>(
    () => ({ query, setQuery, highlightedId, setHighlightedId, registerItem, visibleIds, onClose }),
    [query, highlightedId, registerItem, visibleIds, onClose],
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-[280] bg-background/70 backdrop-blur-sm",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150",
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-[20vh] left-1/2 z-[290] -translate-x-1/2 w-[min(640px,calc(100vw-2rem))]",
            "rounded-2xl bg-card ring-1 ring-border/70 shadow-2xl outline-none overflow-hidden",
            "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
            "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
            "transition-[opacity,transform] duration-150",
          )}
          aria-label={label}
        >
          <CommandContext.Provider value={ctx}>{children}</CommandContext.Provider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function CommandInput({ placeholder = "Type a command or search..." }: { placeholder?: string }) {
  const { query, setQuery, visibleIds, highlightedId, setHighlightedId } = useCommand()

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (visibleIds.length === 0) return
    const idx = highlightedId ? visibleIds.indexOf(highlightedId) : -1
    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = visibleIds[(idx + 1) % visibleIds.length]
      setHighlightedId(next)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = visibleIds[(idx - 1 + visibleIds.length) % visibleIds.length]
      setHighlightedId(prev)
    } else if (e.key === "Enter" && highlightedId) {
      e.preventDefault()
      const item = document.querySelector<HTMLDivElement>(`[data-command-item-id="${highlightedId}"]`)
      item?.click()
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
      <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden />
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  )
}

export function CommandList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="listbox" className={cn("max-h-[60vh] overflow-y-auto p-1", className)}>
      {children}
    </div>
  )
}

export function CommandEmpty({ children = "No results." }: { children?: React.ReactNode }) {
  const { visibleIds } = useCommand()
  if (visibleIds.length > 0) return null
  return <div className="px-4 py-6 text-center text-sm text-muted-foreground/70">{children}</div>
}

export function CommandGroup({ heading, children }: { heading?: React.ReactNode; children: React.ReactNode }) {
  // Hide the group header if every child item is filtered out.
  // Children render their own visibility — we just dim the heading when there are no visible items in this group.
  // For simplicity, always render the heading; CommandItem hides itself.
  return (
    <div role="group" className="py-1">
      {heading && (
        <div className="px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50 font-medium">{heading}</div>
      )}
      {children}
    </div>
  )
}

interface CommandItemProps {
  /** Search-match string (use a descriptive label including synonyms). */
  value: string
  /** Called when the user activates this item. Palette closes automatically. */
  onSelect: () => void
  children: React.ReactNode
  /** Right-aligned shortcut hint, e.g. "⌘K". */
  shortcut?: React.ReactNode
  /** If true, item is rendered but not selectable. */
  disabled?: boolean
}

export function CommandItem({ value, onSelect, children, shortcut, disabled }: CommandItemProps) {
  const id = React.useId()
  const ctx = useCommand()
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => ctx.registerItem(id, value), [id, value, ctx])

  const visible = ctx.visibleIds.includes(id)
  const highlighted = ctx.highlightedId === id

  // Scroll into view when highlighted via keyboard
  React.useEffect(() => {
    if (visible && highlighted && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [visible, highlighted])

  if (!visible) return null

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={highlighted}
      aria-disabled={disabled}
      data-command-item-id={id}
      onClick={() => {
        if (disabled) return
        onSelect()
        ctx.onClose()
      }}
      onMouseEnter={() => !disabled && ctx.setHighlightedId(id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        highlighted ? "bg-foreground/[0.06] text-foreground" : "text-foreground/80 hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span className="flex-1 min-w-0 text-sm truncate">{children}</span>
      {shortcut && (
        <span className="text-[10px] text-muted-foreground/50 font-mono tracking-wide shrink-0">{shortcut}</span>
      )}
    </div>
  )
}
