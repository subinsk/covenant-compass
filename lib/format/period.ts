// A covenant period like "1/1/2026 - 3/31/2026", or an empty string when either end is unknown.
export function formatPeriod(start: Date | string | null, end: Date | string | null, locale?: string) {
    if (!start || !end) return ''
    const fmt = (d: Date | string) => new Date(d).toLocaleDateString(locale)
    return `${fmt(start)} - ${fmt(end)}`
}
