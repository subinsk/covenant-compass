import { isOnTime } from '@/lib/dashboard/metrics'

type Cell = string | null | undefined

// One CSV field: quoted when it holds a quote, comma or line break, with quotes doubled.
// A leading = + - @ is prefixed with ' so spreadsheets don't run it as a formula.
export function csvField(value: Cell): string {
    let text = value ?? ''
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Rows to CSV text, CRLF line endings, ending with a line break.
export function toCsv(rows: Cell[][]): string {
    return rows.map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n'
}

// YYYY-MM-DD (UTC), or blank.
export function isoDate(date: Date | null | undefined): string {
    return date ? date.toISOString().slice(0, 10) : ''
}

export type ExportOccurrence = {
    periodStartDate: Date | null
    periodEndDate: Date | null
    dueDate: Date
    status: string
    ragStatus: string
    completionDate: Date | null
    notes: string | null
    facility: { name: string; borrower: { name: string } }
    covenant: { title: string }
}

export const OBLIGATION_CSV_HEADER = [
    'Facility', 'Borrower', 'Covenant', 'Period Start', 'Period End', 'Due Date',
    'Status', 'RAG', 'Completion Date', 'On Time', 'Notes',
]

function onTimeText(o: ExportOccurrence): string {
    const onTime = isOnTime(o)
    return onTime === null ? '' : onTime ? 'yes' : 'no'
}

export function obligationsCsv(occurrences: ExportOccurrence[]): string {
    return toCsv([
        OBLIGATION_CSV_HEADER,
        ...occurrences.map(o => [
            o.facility.name,
            o.facility.borrower.name,
            o.covenant.title,
            isoDate(o.periodStartDate),
            isoDate(o.periodEndDate),
            isoDate(o.dueDate),
            o.status,
            o.ragStatus,
            isoDate(o.completionDate),
            onTimeText(o),
            o.notes,
        ]),
    ])
}
