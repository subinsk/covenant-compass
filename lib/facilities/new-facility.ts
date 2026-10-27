export type FacilityForm = {
    name: string
    borrowerOrgId: string
    facilityReference: string
    currency: string
    totalCommitment: string
    startDate: string
    endDate: string
    description: string
}

export type NewFacilityBody = {
    name: string
    borrowerOrgId: string
    facilityReference?: string
    currency: string
    totalCommitment?: number
    startDate: string
    endDate: string
    description?: string
}

export const EMPTY_FACILITY_FORM: FacilityForm = {
    name: '',
    borrowerOrgId: '',
    facilityReference: '',
    currency: 'USD',
    totalCommitment: '',
    startDate: '',
    endDate: '',
    description: '',
}

function optional(value: string): string | undefined {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

// "1,250,000" or " 5e6 " -> number; blank or unparseable -> undefined.
function amount(value: string): number | undefined {
    const cleaned = value.replace(/[,\s]/g, '')
    if (cleaned === '') return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
}

// Maps the New Facility form to the body POST /api/facilities expects.
export function buildFacilityRequestBody(form: FacilityForm): NewFacilityBody {
    return {
        name: form.name.trim(),
        borrowerOrgId: form.borrowerOrgId.trim(),
        facilityReference: optional(form.facilityReference),
        currency: form.currency.trim().toUpperCase(),
        totalCommitment: amount(form.totalCommitment),
        startDate: form.startDate.trim(),
        endDate: form.endDate.trim(),
        description: optional(form.description),
    }
}

// Mirrors createFacilitySchema so the form can flag problems before posting.
export function facilityFormErrors(body: NewFacilityBody): Partial<Record<keyof NewFacilityBody, string>> {
    const errors: Partial<Record<keyof NewFacilityBody, string>> = {}
    if (!body.name) errors.name = 'Required'
    if (!body.borrowerOrgId) errors.borrowerOrgId = 'Required'
    if (!/^[A-Z]{3}$/.test(body.currency)) errors.currency = 'Expected a 3-letter currency code'
    if (body.totalCommitment === undefined) errors.totalCommitment = 'Enter an amount'
    else if (body.totalCommitment <= 0) errors.totalCommitment = 'Must be greater than zero'

    const start = Date.parse(body.startDate)
    const end = Date.parse(body.endDate)
    if (Number.isNaN(start)) errors.startDate = 'Required'
    if (Number.isNaN(end)) errors.endDate = 'Required'
    else if (!Number.isNaN(start) && end <= start) errors.endDate = 'End date must be after start date'
    return errors
}
