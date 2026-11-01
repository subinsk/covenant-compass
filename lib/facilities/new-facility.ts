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

export const FACILITY_STATUSES = ['ACTIVE', 'MATURED', 'DEFAULTED'] as const
export type FacilityStatusValue = (typeof FACILITY_STATUSES)[number]

// The edit form: the New Facility fields plus the status. The borrower stays as it is.
export type EditFacilityForm = FacilityForm & { status: FacilityStatusValue }

export type UpdateFacilityBody = Omit<NewFacilityBody, 'borrowerOrgId' | 'description'> & {
    // Blank clears it.
    description: string
    status: FacilityStatusValue
}

type DateLike = Date | string
const dateInput = (d: DateLike) => new Date(d).toISOString().slice(0, 10)

// Pre-fills the edit form from a stored facility (commitment already a string).
export function facilityFormFrom(facility: {
    name: string; borrowerOrgId: string; facilityReference: string; currency: string; totalCommitment: string
    startDate: DateLike; endDate: DateLike; description: string | null; status: FacilityStatusValue
}): EditFacilityForm {
    return {
        name: facility.name,
        borrowerOrgId: facility.borrowerOrgId,
        facilityReference: facility.facilityReference,
        currency: facility.currency,
        totalCommitment: facility.totalCommitment,
        startDate: dateInput(facility.startDate),
        endDate: dateInput(facility.endDate),
        description: facility.description ?? '',
        status: facility.status,
    }
}

// Maps the edit form to the body PATCH /api/facilities/[facilityId] expects.
export function buildFacilityUpdateBody(form: EditFacilityForm): UpdateFacilityBody {
    const body = buildFacilityRequestBody(form)
    return {
        name: body.name,
        facilityReference: body.facilityReference,
        currency: body.currency,
        totalCommitment: body.totalCommitment,
        startDate: body.startDate,
        endDate: body.endDate,
        description: form.description.trim(),
        status: form.status,
    }
}

// Same checks as the New Facility form; the reference can't be blanked once set.
export function facilityUpdateErrors(body: UpdateFacilityBody): Partial<Record<keyof UpdateFacilityBody, string>> {
    const errors: Partial<Record<keyof UpdateFacilityBody, string>> = facilityFormErrors({ ...body, borrowerOrgId: 'unchanged' })
    if (!body.facilityReference) errors.facilityReference = 'Required'
    return errors
}
