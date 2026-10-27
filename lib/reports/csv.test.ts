import { describe, expect, it } from 'vitest'
import { csvField, isoDate, obligationsCsv, toCsv, type ExportOccurrence } from './csv'

describe('csvField', () => {
    it('leaves plain text alone and blanks null', () => {
        expect(csvField('Acme Term Loan')).toBe('Acme Term Loan')
        expect(csvField(null)).toBe('')
        expect(csvField(undefined)).toBe('')
    })

    it('quotes fields with commas, quotes or line breaks and doubles quotes', () => {
        expect(csvField('Leverage, senior')).toBe('"Leverage, senior"')
        expect(csvField('the "big" one')).toBe('"the ""big"" one"')
        expect(csvField('line one\nline two')).toBe('"line one\nline two"')
        expect(csvField('a\r\nb')).toBe('"a\r\nb"')
    })

    it('stops spreadsheets reading a field as a formula', () => {
        expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
        expect(csvField('@cmd')).toBe("'@cmd")
        expect(csvField('-1,2')).toBe(`"'-1,2"`)
    })
})

describe('toCsv', () => {
    it('joins rows with CRLF and ends with a line break', () => {
        expect(toCsv([['a', 'b'], ['c,d', null]])).toBe('a,b\r\n"c,d",\r\n')
    })
})

describe('isoDate', () => {
    it('formats as YYYY-MM-DD in UTC', () => {
        expect(isoDate(new Date('2026-03-31T23:30:00Z'))).toBe('2026-03-31')
        expect(isoDate(null)).toBe('')
    })
})

describe('obligationsCsv', () => {
    const base: ExportOccurrence = {
        periodStartDate: new Date('2026-01-01T00:00:00Z'),
        periodEndDate: new Date('2026-03-31T00:00:00Z'),
        dueDate: new Date('2026-04-30T00:00:00Z'),
        status: 'COMPLETED',
        ragStatus: 'GREEN',
        completionDate: new Date('2026-04-20T10:00:00Z'),
        notes: null,
        facility: { name: 'Acme, Term Loan', borrower: { name: 'Acme Corp' } },
        covenant: { title: 'Quarterly Financials' },
    }

    it('writes a header and one row per obligation with on-time yes/no/blank', () => {
        const csv = obligationsCsv([
            base,
            { ...base, completionDate: new Date('2026-05-02T00:00:00Z') },
            { ...base, status: 'OVERDUE', ragStatus: 'RED', completionDate: null },
            { ...base, status: 'WAIVED', completionDate: null, periodStartDate: null, notes: 'Waived 2026-05-01: "agreed"' },
        ])
        expect(csv.split('\r\n')).toEqual([
            'Facility,Borrower,Covenant,Period Start,Period End,Due Date,Status,RAG,Completion Date,On Time,Notes',
            '"Acme, Term Loan",Acme Corp,Quarterly Financials,2026-01-01,2026-03-31,2026-04-30,COMPLETED,GREEN,2026-04-20,yes,',
            '"Acme, Term Loan",Acme Corp,Quarterly Financials,2026-01-01,2026-03-31,2026-04-30,COMPLETED,GREEN,2026-05-02,no,',
            '"Acme, Term Loan",Acme Corp,Quarterly Financials,2026-01-01,2026-03-31,2026-04-30,OVERDUE,RED,,no,',
            '"Acme, Term Loan",Acme Corp,Quarterly Financials,,2026-03-31,2026-04-30,WAIVED,GREEN,,,"Waived 2026-05-01: ""agreed"""',
            '',
        ])
    })
})
