import { format } from 'date-fns'

// A covenant period like "1 Jan 2026 – 31 Mar 2026", or an empty string when either end is unknown.
// A fixed format rather than the user's locale, so server and client render the same text.
export function formatPeriod(start: Date | string | null, end: Date | string | null) {
    if (!start || !end) return ''
    const fmt = (d: Date | string) => format(new Date(d), 'd MMM yyyy')
    return `${fmt(start)} – ${fmt(end)}`
}
