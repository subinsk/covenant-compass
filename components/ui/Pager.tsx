'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/components/ui/core'
import { pageWindow } from '@/lib/format/pages'

const BUTTON = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40'

// Client-side pager for lists paged in the browser.
export function Pager({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
    const pages = pageWindow(page, totalPages)
    return (
        <nav className="flex items-center gap-1" aria-label="Pagination">
            <button type="button" className={cn(BUTTON, 'hover:bg-accent')} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
            </button>
            {pages.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                    {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                    <button
                        type="button"
                        onClick={() => onPageChange(p)}
                        aria-current={p === page ? 'page' : undefined}
                        className={cn(BUTTON, p === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent')}
                    >
                        {p}
                    </button>
                </span>
            ))}
            <button type="button" className={cn(BUTTON, 'hover:bg-accent')} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
            </button>
        </nav>
    )
}
