import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edgarFetch, edgarJson, filingDocUrl, padCik } from './client'

let dir: string

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'edgar-cache-'))
    vi.stubEnv('SEC_USER_AGENT', 'Test Agent test@example.com')
    vi.stubEnv('EDGAR_CACHE_DIR', dir)
    // Skip real waits (rate limiter and retry backoff).
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn()
        return 0
    }) as unknown as typeof setTimeout)
})

afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
})

describe('edgarFetch', () => {
    it('sends the User-Agent header and returns the body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('hello', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        expect(await edgarFetch('https://data.sec.gov/a')).toBe('hello')
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://data.sec.gov/a')
        expect(init.headers['User-Agent']).toBe('Test Agent test@example.com')
    })

    it('throws when SEC_USER_AGENT is not set', async () => {
        vi.stubEnv('SEC_USER_AGENT', '')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        await expect(edgarFetch('https://data.sec.gov/a')).rejects.toThrow('SEC_USER_AGENT is not set')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('serves the second request from the disk cache', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response('{"x":1}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        expect(await edgarJson('https://data.sec.gov/b')).toEqual({ x: 1 })
        expect(await edgarJson('https://data.sec.gov/b')).toEqual({ x: 1 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('retries on 429 and then succeeds', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        expect(await edgarFetch('https://data.sec.gov/c')).toBe('ok')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('gives up after 3 attempts', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response('down', { status: 503 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(edgarFetch('https://data.sec.gov/d')).rejects.toThrow('(503) after 3 attempt(s)')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('does not retry on 404', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response('missing', { status: 404 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(edgarFetch('https://data.sec.gov/e')).rejects.toThrow('(404)')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('padCik', () => {
    it('zero-pads to 10 digits', () => {
        expect(padCik(320193)).toBe('0000320193')
        expect(padCik('320193')).toBe('0000320193')
        expect(padCik('CIK0000320193')).toBe('0000320193')
    })

    it('rejects non-numeric input', () => {
        expect(() => padCik('abc')).toThrow('Invalid CIK')
        expect(() => padCik('12345678901')).toThrow('Invalid CIK')
    })
})

describe('filingDocUrl', () => {
    it('uses the unpadded CIK and the accession number without dashes', () => {
        expect(filingDocUrl('0000320193', '0000320193-24-000123', 'ex10-1.htm'))
            .toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/ex10-1.htm')
    })
})
