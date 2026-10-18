import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findExhibits, isExhibitName } from './exhibits'

let dir: string

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'edgar-cache-'))
    vi.stubEnv('SEC_USER_AGENT', 'Test Agent test@example.com')
    vi.stubEnv('EDGAR_CACHE_DIR', dir)
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

const submissions = {
    cik: '1234',
    name: 'Acme Corp',
    filings: {
        recent: {
            accessionNumber: ['0001234-24-000003', '0001234-24-000002', '0001234-24-000001'],
            form: ['8-K', '4', '10-Q'],
            filingDate: ['2024-03-01', '2024-02-01', '2024-01-01'],
            primaryDocument: ['a8k.htm', 'form4.xml', 'a10q.htm'],
        },
    },
}

const indexes: Record<string, string[]> = {
    '000123424000003': ['a8k.htm', 'ex10-1.htm', 'EX-10_2.HTM', 'ex99-1.htm', 'ex10-1.jpg'],
    '000123424000001': ['a10q.htm', 'exhibit1012.htm', 'ex31.htm'],
}

function json(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200 })
}

describe('isExhibitName', () => {
    it('matches common EX-10 spellings', () => {
        for (const name of ['ex10.htm', 'ex-10.htm', 'ex10-1.htm', 'd123dex101.htm', 'exhibit10_1.txt', 'EX-10.3.HTML']) {
            expect(isExhibitName(name)).toBe(true)
        }
    })

    it('ignores other exhibits and non-document files', () => {
        for (const name of ['ex99-1.htm', 'ex31.htm', 'a10-q.htm', 'ex10-1.jpg', 'index.json']) {
            expect(isExhibitName(name)).toBe(false)
        }
    })
})

describe('findExhibits', () => {
    it('returns EX-10 files from matching filings only', async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url === 'https://data.sec.gov/submissions/CIK0000001234.json') return json(submissions)
            const match = url.match(/\/data\/1234\/(\d+)\/index\.json$/)
            if (match && indexes[match[1]]) {
                return json({ directory: { item: indexes[match[1]].map((name) => ({ name })) } })
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const exhibits = await findExhibits(1234)

        expect(exhibits).toEqual([
            {
                accessionNumber: '0001234-24-000003',
                form: '8-K',
                filingDate: '2024-03-01',
                filename: 'ex10-1.htm',
                url: 'https://www.sec.gov/Archives/edgar/data/1234/000123424000003/ex10-1.htm',
            },
            {
                accessionNumber: '0001234-24-000003',
                form: '8-K',
                filingDate: '2024-03-01',
                filename: 'EX-10_2.HTM',
                url: 'https://www.sec.gov/Archives/edgar/data/1234/000123424000003/EX-10_2.HTM',
            },
            {
                accessionNumber: '0001234-24-000001',
                form: '10-Q',
                filingDate: '2024-01-01',
                filename: 'exhibit1012.htm',
                url: 'https://www.sec.gov/Archives/edgar/data/1234/000123424000001/exhibit1012.htm',
            },
        ])
        // Form 4 filing is skipped, so only submissions + two index requests.
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('limits the number of filings scanned', async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/submissions/')) return json(submissions)
            return json({ directory: { item: [{ name: 'ex10.htm' }] } })
        })
        vi.stubGlobal('fetch', fetchMock)

        const exhibits = await findExhibits('1234', { limit: 1 })

        expect(exhibits.map((e) => e.accessionNumber)).toEqual(['0001234-24-000003'])
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
