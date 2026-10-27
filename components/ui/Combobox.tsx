'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/components/ui/core'

export type ComboboxOption = { value: string; label: string }

// A searchable select: a button that opens a filterable list. Arrow keys move,
// Enter picks, Escape closes (without closing a surrounding modal).
export function Combobox({ options, value, onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', invalid }: {
    options: ComboboxOption[]
    value: string
    onChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    invalid?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const rootRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const listId = useId()

    const selected = options.find(o => o.value === value)
    const q = query.trim().toLowerCase()
    const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options

    useEffect(() => {
        if (!open) return
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [open])

    // Keep the highlighted option in view while moving with the keyboard.
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [active])

    const openList = () => {
        setQuery('')
        setActive(Math.max(0, options.findIndex(o => o.value === value)))
        setOpen(true)
    }

    const pick = (option: ComboboxOption) => {
        onChange(option.value)
        setOpen(false)
        buttonRef.current?.focus()
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openList()
            }
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            buttonRef.current?.focus()
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(i => Math.min(i + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered[active]) pick(filtered[active])
        } else if (e.key === 'Tab') {
            setOpen(false)
        }
    }

    return (
        <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => (open ? setOpen(false) : openList())}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                className={cn(
                    'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    open && 'ring-2 ring-ring',
                    invalid && 'border-destructive'
                )}
            >
                <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
            </button>

            {open && (
                <div
                    // Inside a <label>, a click would also be forwarded to the trigger button and reopen the list.
                    onClick={e => e.preventDefault()}
                    className="absolute left-0 right-0 top-full z-10 mt-1.5 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg animate-pop-in"
                >
                    <div className="flex items-center gap-2 border-b px-3">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => { setQuery(e.target.value); setActive(0) }}
                            placeholder={searchPlaceholder}
                            role="combobox"
                            aria-expanded="true"
                            aria-controls={listId}
                            aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <ul ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto p-1">
                        {filtered.length === 0 ? (
                            <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matches</li>
                        ) : filtered.map((option, i) => (
                            <li
                                key={option.value}
                                id={`${listId}-${i}`}
                                data-index={i}
                                role="option"
                                aria-selected={option.value === value}
                                onPointerMove={() => setActive(i)}
                                onClick={() => pick(option)}
                                className={cn(
                                    'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm transition-colors',
                                    i === active && 'bg-accent text-accent-foreground',
                                    option.value === value && 'font-medium'
                                )}
                            >
                                <span className="truncate">{option.label}</span>
                                {option.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
