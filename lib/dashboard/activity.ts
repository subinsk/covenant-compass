import { format } from 'date-fns'

export type AuditEntryInput = {
    entityType: string
    entityId: string
    action: string
    details: unknown
    performedBy: { name: string }
}

export type AuditLookups = {
    facilities: Map<string, { name: string }>
    occurrences: Map<string, { facilityId: string; title: string; dueDate: Date }>
    documents: Map<string, { facilityId: string; fileName: string }>
}

export type ActivityItem = { facilityId: string; facilityName: string; text: string }

function detail(details: unknown, key: string): string | null {
    if (!details || typeof details !== 'object') return null
    const value = (details as Record<string, unknown>)[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Turns an audit row into one line of dashboard activity. Resolves the facility through
// the entity (facility directly, occurrence or document via its facilityId). Returns null
// when the entity isn't in the lookups, i.e. it's outside the viewer's facilities.
export function describeAudit(entry: AuditEntryInput, lookups: AuditLookups): ActivityItem | null {
    const who = entry.performedBy.name
    let facilityId: string
    let text: string

    if (entry.entityType === 'FACILITY') {
        facilityId = entry.entityId
        text = detail(entry.details, 'kind') === 'extraction'
            ? `${who} started an agreement import`
            : `${who} created the facility`
    } else if (entry.entityType === 'OCCURRENCE') {
        const occurrence = lookups.occurrences.get(entry.entityId)
        if (!occurrence) return null
        facilityId = occurrence.facilityId
        const what = `${occurrence.title} (due ${format(occurrence.dueDate, 'd MMM yyyy')})`
        if (entry.action === 'COMPLETE') text = `${who} marked ${what} complete`
        else if (entry.action === 'WAIVE') {
            const reason = detail(entry.details, 'reason')
            text = `${who} waived ${what}${reason ? `: ${reason}` : ''}`
        } else if (detail(entry.details, 'action') === 'reopen') text = `${who} reopened ${what}`
        else text = `${who} updated ${what}`
    } else if (entry.entityType === 'DOCUMENT') {
        const document = lookups.documents.get(entry.entityId)
        if (!document) return null
        facilityId = document.facilityId
        text = `${who} uploaded ${document.fileName}`
    } else {
        return null
    }

    const facility = lookups.facilities.get(facilityId)
    if (!facility) return null
    return { facilityId, facilityName: facility.name, text }
}
