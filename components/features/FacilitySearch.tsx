'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'

// Search box for the facilities list. Updates ?q= as you type (debounced) and
// drops ?page= so results start from the first page.
export function FacilitySearch() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const current = searchParams.get('q') ?? ''
    const [value, setValue] = useState(current)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (value.trim() === current) return
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams)
            if (value.trim()) params.set('q', value.trim())
            else params.delete('q')
            params.delete('page')
            const qs = params.toString()
            startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname))
        }, 300)
        return () => clearTimeout(timer)
    }, [value, current, searchParams, pathname, router])

    return (
        <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="search"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Search name, reference or borrower"
                aria-label="Search facilities"
                className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-9 text-sm shadow-sm transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {isPending ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : value && (
                <button
                    type="button"
                    onClick={() => setValue('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}
