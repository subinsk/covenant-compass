import { describe, expect, it, vi } from 'vitest'
import type { CitedCovenant } from './extract'
import { completeRun, failRun, saveExtraction, type ExtractionStore, type RunUpdateStore } from './store'

const leverage: CitedCovenant = {
    name: 'Maximum Leverage Ratio',
    metric: 'leverage',
    operator: '<=',
    limit: 3.5,
    testFrequency: 'quarterly',
    stepDowns: [{ from: 'Q4 2025', limit: 3.25 }],
    numerator: 'Consolidated Total Debt',
    denominator: 'Consolidated EBITDA',
    quote: 'Permit the Leverage Ratio to be greater than 3.50 to 1.00.',
    citation: { start: 250, end: 310 },
    verified: true,
    limitInQuote: true,
    operatorCorrected: false,
    directionConflict: false,
}

const unverified: CitedCovenant = {
    name: 'Minimum Interest Coverage',
    metric: 'interest-coverage',
    operator: '>=',
    limit: 3,
    testFrequency: undefined,
    stepDowns: undefined,
    numerator: undefined,
    denominator: undefined,
    quote: 'not in the text',
    citation: null,
    verified: false,
    limitInQuote: false,
    operatorCorrected: true,
    directionConflict: true,
}

type Row = Record<string, unknown>
type CreateArgs = { data: Row & { items: { create: Row[] } }, include: unknown }

function fakeStore() {
    const create = vi.fn(async (args: CreateArgs) => ({ id: 'run-1', ...args.data }))
    const store = { extractionRun: { create } } as unknown as ExtractionStore
    return { store, create }
}

describe('saveExtraction', () => {
    it('creates a run with one pending row per covenant', async () => {
        const { store, create } = fakeStore()
        await saveExtraction(store, {
            facilityId: 'f1',
            sourceUrl: 'https://example.com/a.htm',
            model: 'test-model',
            promptChars: 1234,
            covenants: [leverage, unverified],
            pageStarts: [0, 100, 200, 300],
            userId: 'u1',
        })

        expect(create).toHaveBeenCalledTimes(1)
        const { data, include } = create.mock.calls[0][0]
        expect(include).toEqual({ items: true })
        expect(data).toMatchObject({
            facilityId: 'f1',
            sourceUrl: 'https://example.com/a.htm',
            model: 'test-model',
            promptChars: 1234,
            createdByUserId: 'u1',
        })
        const [first, second] = data.items.create
        expect(first).toMatchObject({
            name: 'Maximum Leverage Ratio',
            metric: 'leverage',
            operator: '<=',
            limit: 3.5,
            stepDowns: [{ from: 'Q4 2025', limit: 3.25 }],
            numerator: 'Consolidated Total Debt',
            denominator: 'Consolidated EBITDA',
            citationStart: 250,
            citationEnd: 310,
            page: 3,
            verified: true,
            limitInQuote: true,
        })
        expect(first.status).toBeUndefined()
        expect(second).toMatchObject({
            citationStart: undefined,
            citationEnd: undefined,
            page: undefined,
            stepDowns: undefined,
            verified: false,
            limitInQuote: false,
            operatorCorrected: true,
            directionConflict: true,
        })
    })

    it('leaves page empty when the text has no page breaks', async () => {
        const { store, create } = fakeStore()
        await saveExtraction(store, {
            facilityId: 'f1', sourceUrl: 'u', model: 'm', promptChars: 0, covenants: [leverage], pageStarts: [],
        })
        const { data } = create.mock.calls[0][0]
        expect(data.createdByUserId).toBeUndefined()
        expect(data.items.create[0].page).toBeUndefined()
    })
})

function fakeUpdateStore() {
    const update = vi.fn(async (args: { where: Row, data: Row }) => ({ id: args.where.id, ...args.data }))
    const store = { extractionRun: { update } } as unknown as RunUpdateStore
    return { store, update }
}

describe('completeRun', () => {
    it('adds the covenants to the run and marks it done', async () => {
        const { store, update } = fakeUpdateStore()
        await completeRun(store, 'run-1', { promptChars: 99, covenants: [leverage], pageStarts: [0, 100, 200, 300] })
        const { where, data } = update.mock.calls[0][0] as { where: Row, data: Row & { items: { create: Row[] } } }
        expect(where).toEqual({ id: 'run-1' })
        expect(data).toMatchObject({ status: 'DONE', promptChars: 99 })
        expect(data.items.create).toHaveLength(1)
        expect(data.items.create[0]).toMatchObject({ name: 'Maximum Leverage Ratio', page: 3 })
    })
})

describe('failRun', () => {
    it('marks the run failed with the error', async () => {
        const { store, update } = fakeUpdateStore()
        await failRun(store, 'run-1', 'boom')
        expect(update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { status: 'FAILED', error: 'boom' } })
    })
})
