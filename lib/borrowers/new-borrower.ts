export const BORROWER_FIELDS = [
    'name', 'legalName', 'registrationNumber', 'country', 'industry', 'website',
    'contactName', 'contactEmail', 'contactPhone', 'address', 'notes',
] as const

export type BorrowerForm = Record<(typeof BORROWER_FIELDS)[number], string>

export const EMPTY_BORROWER_FORM = Object.fromEntries(BORROWER_FIELDS.map(f => [f, ''])) as BorrowerForm

// Trimmed values with blanks left out; the body POST /api/borrowers expects.
export function buildBorrowerRequestBody(form: BorrowerForm): Partial<BorrowerForm> {
    const body: Partial<BorrowerForm> = {}
    for (const field of BORROWER_FIELDS) {
        const value = form[field].trim()
        if (value) body[field] = value
    }
    return body
}

// Mirrors createBorrowerSchema so the form can flag problems before posting.
export function borrowerFormErrors(body: Partial<BorrowerForm>): Partial<Record<keyof BorrowerForm, string>> {
    const errors: Partial<Record<keyof BorrowerForm, string>> = {}
    if (!body.name) errors.name = 'Required'
    if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) errors.contactEmail = 'Enter a valid email'
    return errors
}
