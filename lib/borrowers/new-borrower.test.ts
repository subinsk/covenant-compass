import { describe, expect, it } from 'vitest'
import {
    EMPTY_BORROWER_FORM, borrowerFormErrors, borrowerFormFrom, buildBorrowerRequestBody, buildBorrowerUpdateBody,
} from './new-borrower'

describe('borrowerFormFrom', () => {
    it('fills every field, with blanks for missing values', () => {
        expect(borrowerFormFrom({ name: 'Initech', contactEmail: null, country: 'US' }))
            .toEqual({ ...EMPTY_BORROWER_FORM, name: 'Initech', country: 'US' })
    })
})

describe('buildBorrowerUpdateBody', () => {
    it('trims every field and keeps blanks so they clear the stored value', () => {
        const body = buildBorrowerUpdateBody({ ...EMPTY_BORROWER_FORM, name: ' Initech ', notes: '  ' })
        expect(body).toEqual({ ...EMPTY_BORROWER_FORM, name: 'Initech' })
        expect(borrowerFormErrors(body)).toEqual({})
    })
})

describe('buildBorrowerRequestBody', () => {
    it('trims values and leaves blanks out', () => {
        expect(buildBorrowerRequestBody({ ...EMPTY_BORROWER_FORM, name: ' Initech ', country: '  ', contactEmail: 'a@b.co ' }))
            .toEqual({ name: 'Initech', contactEmail: 'a@b.co' })
    })
})

describe('borrowerFormErrors', () => {
    it('needs a name', () => {
        expect(borrowerFormErrors({})).toEqual({ name: 'Required' })
    })

    it('checks the contact email only when given', () => {
        expect(borrowerFormErrors({ name: 'Initech' })).toEqual({})
        expect(borrowerFormErrors({ name: 'Initech', contactEmail: 'nope' })).toEqual({ contactEmail: 'Enter a valid email' })
    })
})
