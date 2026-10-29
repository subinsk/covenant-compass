import { describe, expect, it, vi } from 'vitest'
import type { CitedCovenant } from './extract'
import { extractionConfigError, importAgreementSchema, isEdgarArchiveUrl, runExtraction, shortError, type ExtractionSteps } from './import'

const EDGAR = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/ex10-1.htm'

describe('isEdgarArchiveUrl', () => {
    it('accepts EDGAR archive URLs', () => {
        expect(isEdgarArchiveUrl(EDGAR)).toBe(true)
    })

    it.each([
        ['not a url', 'ex10-1.htm'],
        ['http', EDGAR.replace('https:', 'http:')],
        ['other host', 'https://sec.gov/Archives/edgar/data/1/a.htm'],
        ['lookalike host', 'https://www.sec.gov.evil.com/Archives/edgar/data/1/a.htm'],
        ['credentials', 'https://user@www.sec.gov/Archives/edgar/data/1/a.htm'],
        ['port', 'https://www.sec.gov:8443/Archives/edgar/data/1/a.htm'],
        ['other path', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany'],
        ['path escaping the archive', 'https://www.sec.gov/Archives/edgar/data/../../cgi-bin/x'],
    ])('rejects %s', (_, url) => {
        expect(isEdgarArchiveUrl(url)).toBe(false)
    })
})

describe('importAgreementSchema', () => {
    it('trims and accepts a facility and EDGAR URL', () => {
        expect(importAgreementSchema.parse({ facilityId: ' f1 ', url: ` ${EDGAR} ` })).toEqual({ facilityId: 'f1', url: EDGAR })
    })

    it('rejects a missing facility or a non-EDGAR URL', () => {
        const result = importAgreementSchema.safeParse({ facilityId: '', url: 'https://example.com/a.htm' })
        expect(result.success).toBe(false)
        const paths = result.error!.issues.map((i) => i.path[0])
        expect(paths).toEqual(['facilityId', 'url'])
    })

    it('rejects a missing body', () => {
        expect(importAgreementSchema.safeParse(null).success).toBe(false)
    })
})

describe('extractionConfigError', () => {
    it('is null when everything is set', () => {
        expect(extractionConfigError({ LLM_BASE_URL: 'http://x', LLM_MODEL: 'm', SEC_USER_AGENT: 'a b@c.d' }, 'edgar')).toBeNull()
    })

    it('names the missing settings', () => {
        expect(extractionConfigError({ LLM_MODEL: 'm', SEC_USER_AGENT: '' }, 'edgar')).toBe(
            'Agreement import is not configured on this server (missing LLM_BASE_URL, SEC_USER_AGENT)',
        )
    })

    it('does not need the SEC user agent for uploads', () => {
        expect(extractionConfigError({ LLM_BASE_URL: 'http://x', LLM_MODEL: 'm' }, 'upload')).toBeNull()
        expect(extractionConfigError({ LLM_BASE_URL: 'http://x', SEC_USER_AGENT: 'a b@c.d' }, 'upload')).toBe(
            'Agreement import is not configured on this server (missing LLM_MODEL)',
        )
    })
})

describe('shortError', () => {
    it('keeps short messages and truncates long ones', () => {
        expect(shortError(new Error('boom'))).toBe('boom')
        expect(shortError('plain')).toBe('plain')
        const long = shortError(new Error('x'.repeat(1000)))
        expect(long).toHaveLength(300)
        expect(long.endsWith('…')).toBe(true)
    })
})

const covenant = { name: 'Max Leverage', limit: 3.5 } as CitedCovenant

function fakeSteps(overrides: Partial<ExtractionSteps> = {}) {
    const steps = {
        load: vi.fn(async () => ({ text: 'agreement text', pageStarts: [0, 10] })),
        extract: vi.fn(async () => ({ covenants: [covenant], promptChars: 42 })),
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
        ...overrides,
    }
    return steps
}

describe('runExtraction', () => {
    it('loads, extracts and completes the run', async () => {
        const steps = fakeSteps()
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('DONE')
        expect(steps.load).toHaveBeenCalledWith(EDGAR)
        expect(steps.extract).toHaveBeenCalledWith('agreement text')
        expect(steps.complete).toHaveBeenCalledWith('run-1', { covenants: [covenant], promptChars: 42, pageStarts: [0, 10] })
        expect(steps.fail).not.toHaveBeenCalled()
    })

    it('fails the run when loading fails', async () => {
        const steps = fakeSteps({ load: vi.fn(async () => { throw new Error('EDGAR request failed (404)') }) })
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('FAILED')
        expect(steps.extract).not.toHaveBeenCalled()
        expect(steps.complete).not.toHaveBeenCalled()
        expect(steps.fail).toHaveBeenCalledWith('run-1', 'EDGAR request failed (404)')
    })

    it('fails the run when extraction fails', async () => {
        const steps = fakeSteps({ extract: vi.fn(async () => { throw new Error('LLM response invalid') }) })
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('FAILED')
        expect(steps.complete).not.toHaveBeenCalled()
        expect(steps.fail).toHaveBeenCalledWith('run-1', 'LLM response invalid')
    })

    it('fails the run when saving fails', async () => {
        const steps = fakeSteps({ complete: vi.fn(async () => { throw new Error('db down') }) })
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('FAILED')
        expect(steps.fail).toHaveBeenCalledWith('run-1', 'db down')
    })

    it('does not reject when marking the run failed also fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const steps = fakeSteps({
            extract: vi.fn(async () => { throw new Error('boom') }),
            fail: vi.fn(async () => { throw new Error('db down') }),
        })
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('FAILED')
        expect(error).toHaveBeenCalled()
        error.mockRestore()
    })

    it('reports each stage before the step it starts', async () => {
        const calls: string[] = []
        const steps = fakeSteps({
            load: vi.fn(async () => { calls.push('load'); return { text: 't', pageStarts: [] } }),
            extract: vi.fn(async () => { calls.push('extract'); return { covenants: [], promptChars: 1 } }),
            complete: vi.fn(async () => { calls.push('complete') }),
            onStage: vi.fn(async (_runId: string, stage: string) => { calls.push(stage) }),
        })
        expect(await runExtraction('run-1', 'agreement.pdf', steps)).toBe('DONE')
        expect(calls).toEqual(['READING', 'load', 'EXTRACTING', 'extract', 'SAVING', 'complete'])
        expect(steps.onStage).toHaveBeenCalledWith('run-1', 'READING')
    })

    it('carries on when saving a stage fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const steps = fakeSteps({ onStage: vi.fn(async () => { throw new Error('db down') }) })
        expect(await runExtraction('run-1', EDGAR, steps)).toBe('DONE')
        expect(steps.complete).toHaveBeenCalled()
        expect(steps.fail).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalled()
        error.mockRestore()
    })
})
