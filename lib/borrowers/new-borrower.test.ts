import { describe, expect, it } from 'vitest'
import { EMPTY_BORROWER_FORM, borrowerFormErrors, buildBorrowerRequestBody } from './new-borrower'

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
