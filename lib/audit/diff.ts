export type FieldValue = string | number | boolean | null
export type FieldChange = { before: FieldValue; after: FieldValue }

// Dates as ISO strings and Decimals as their string form, so values compare and store as JSON.
function plain(value: unknown): FieldValue {
    if (value === undefined || value === null) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    return String(value)
}

// The fields whose value differs between two versions of a record, for an audit entry.
export function changedFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: readonly string[],
): Record<string, FieldChange> {
    const changes: Record<string, FieldChange> = {}
    for (const field of fields) {
        const from = plain(before[field])
        const to = plain(after[field])
        if (from !== to) changes[field] = { before: from, after: to }
    }
    return changes
}
