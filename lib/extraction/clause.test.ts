import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@/lib/llm/client'
import { correctThreshold, suggestCovenant, suggestTimeoutMs, suggestWithFallback } from './clause'
import { heuristicParse } from './clause-rules'

vi.mock('@/lib/llm/client', () => ({ chat: vi.fn() }))
const chatMock = vi.mocked(chat)

const leverageClause = 'The Borrower shall not permit the Consolidated Leverage Ratio as of the last day of any fiscal quarter'
    + ' to be greater than 4.50 to 1.00.'

const llmReply = {
    type: 'FINANCIAL',
    frequency: 'QUARTERLY',
    dueRule: '45 days after quarter end',
    graceDays: 0,
    importance: 'HIGH',
    suggestedTitle: 'Maximum Consolidated Leverage Ratio',
    category: 'Financials',
    metricFormula: 'Consolidated Total Debt / Consolidated EBITDA',
    thresholdCondition: '<= 4.5',
}

beforeEach(() => {
    chatMock.mockReset()
    vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1')
    vi.stubEnv('LLM_MODEL', 'test-model')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

describe('suggestWithFallback', () => {
    it('returns the validated LLM suggestion', async () => {
        chatMock.mockResolvedValueOnce(JSON.stringify(llmReply))
        const result = await suggestWithFallback(leverageClause)
        expect(result).toEqual({ ...llmReply, source: 'llm' })
        expect(chatMock).toHaveBeenCalledWith(expect.any(Array), { json: true, temperature: 0 })
    })

    it('falls back to keyword rules when the LLM output stays invalid', async () => {
        chatMock.mockResolvedValue(JSON.stringify({ ...llmReply, type: 'COVENANT' }))
        const result = await suggestWithFallback(leverageClause)
        expect(result).toEqual({ ...heuristicParse(leverageClause), source: 'rules' })
        expect(chatMock).toHaveBeenCalledTimes(3)
    })

    it('falls back to keyword rules when the LLM call times out', async () => {
        vi.useFakeTimers()
        chatMock.mockReturnValue(new Promise(() => {}))
        const pending = suggestWithFallback(leverageClause, { timeoutMs: 1000 })
        await vi.advanceTimersByTimeAsync(1000)
        expect(await pending).toEqual({ ...heuristicParse(leverageClause), source: 'rules' })
    })

    it('uses keyword rules without calling the LLM when none is configured', async () => {
        vi.stubEnv('LLM_BASE_URL', '')
        const result = await suggestWithFallback(leverageClause)
        expect(result.source).toBe('rules')
        expect(chatMock).not.toHaveBeenCalled()
    })
})

describe('suggestCovenant', () => {
    it('corrects an inverted threshold operator from the clause wording', async () => {
        chatMock.mockResolvedValueOnce(JSON.stringify({ ...llmReply, thresholdCondition: '>= 4.5' }))
        const result = await suggestCovenant(leverageClause)
        expect(result.thresholdCondition).toBe('<= 4.5')
    })

    it('drops empty optional fields', async () => {
        chatMock.mockResolvedValueOnce(JSON.stringify({
            ...llmReply, type: 'REPORTING', metricFormula: null, thresholdCondition: '',
        }))
        const result = await suggestCovenant('The Borrower shall deliver quarterly financial statements within 45 days.')
        expect(result.metricFormula).toBeUndefined()
        expect(result.thresholdCondition).toBeUndefined()
    })
})

describe('correctThreshold', () => {
    it('flips a capped operator when the clause sets a floor', () => {
        expect(correctThreshold('<= 2.0', 'The Borrower shall not permit the Interest Coverage Ratio to be less than 2.00 to 1.00.'))
            .toBe('>= 2.0')
    })

    it('leaves the threshold alone when the wording is unclear', () => {
        expect(correctThreshold('>= 1.25', 'Fixed Charge Coverage Ratio of 1.25 to 1.00')).toBe('>= 1.25')
        expect(correctThreshold('4.5x', leverageClause)).toBe('4.5x')
    })
})

describe('suggestTimeoutMs', () => {
    it('reads a positive value and falls back to 60 seconds', () => {
        expect(suggestTimeoutMs('180000')).toBe(180_000)
        expect(suggestTimeoutMs(undefined)).toBe(60_000)
        expect(suggestTimeoutMs('')).toBe(60_000)
        expect(suggestTimeoutMs('-1')).toBe(60_000)
        expect(suggestTimeoutMs('abc')).toBe(60_000)
    })
})
