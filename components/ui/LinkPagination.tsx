import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/components/ui/core'
import { pageWindow } from '@/lib/format/pages'

const BUTTON = 'inline-flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors sm:h-8 sm:min-w-8'

// Pager for server-rendered lists: every page is a link built by hrefFor.
export function LinkPagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
    const pages = pageWindow(page, totalPages)
    return (
        <nav className="flex items-center gap-1" aria-label="Pagination">
            <PageLink href={page > 1 ? hrefFor(page - 1) : undefined} label="Previous page">
                <ChevronLeft className="h-4 w-4" />
            </PageLink>
            {pages.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                    {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                    <Link
                        href={hrefFor(p)}
                        scroll={false}
                        aria-current={p === page ? 'page' : undefined}
                        className={cn(BUTTON, p === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent')}
                    >
                        {p}
                    </Link>
                </span>
            ))}
            <PageLink href={page < totalPages ? hrefFor(page + 1) : undefined} label="Next page">
                <ChevronRight className="h-4 w-4" />
            </PageLink>
        </nav>
    )
}

function PageLink({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
    if (!href) {
        return <span aria-disabled="true" aria-label={label} className={cn(BUTTON, 'text-muted-foreground opacity-40')}>{children}</span>
    }
    return <Link href={href} scroll={false} aria-label={label} className={cn(BUTTON, 'hover:bg-accent')}>{children}</Link>
}
