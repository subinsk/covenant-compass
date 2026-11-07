'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'

const FIELD = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Type, RAG and due-date filters for the reports page. Each change updates the
// URL and goes back to the first page.
export function ReportFilters({ types, rags }: { types: ComboboxOption[]; rags: ComboboxOption[] }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const set = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete('page')
        const qs = params.toString()
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
    }

    return (
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <Field label="Type">
                <Combobox searchable={false} options={[{ value: '', label: 'All types' }, ...types]} value={searchParams.get('type') ?? ''} onChange={v => set('type', v)} />
            </Field>
            <Field label="RAG">
                <Combobox searchable={false} options={[{ value: '', label: 'All' }, ...rags]} value={searchParams.get('rag') ?? ''} onChange={v => set('rag', v)} />
            </Field>
            <Field label="Due from">
                <input type="date" className={FIELD} value={searchParams.get('from') ?? ''} max={searchParams.get('to') ?? undefined} onChange={e => set('from', e.target.value)} />
            </Field>
            <Field label="Due to">
                <input type="date" className={FIELD} value={searchParams.get('to') ?? ''} min={searchParams.get('from') ?? undefined} onChange={e => set('to', e.target.value)} />
            </Field>
            {isPending && <Loader2 className="mb-3 h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-40">
            {label}
            <div className="font-normal text-sm text-foreground">{children}</div>
        </label>
    )
}
