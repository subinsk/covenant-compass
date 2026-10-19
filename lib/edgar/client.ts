import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Small SEC EDGAR client. SEC allows at most 10 requests/second and requires a
// User-Agent with a name and contact email (env SEC_USER_AGENT).
// Responses are cached on disk under .cache/edgar (override with EDGAR_CACHE_DIR).
// Filing documents never change, so they're cached forever; pass maxAgeMs for
// endpoints that do change (submissions, company facts).

const MIN_INTERVAL_MS = 110
const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

let lastRequestAt = 0

export async function edgarFetch(url: string, { maxAgeMs }: { maxAgeMs?: number } = {}): Promise<string> {
    const userAgent = process.env.SEC_USER_AGENT
    if (!userAgent) {
        throw new Error('SEC_USER_AGENT is not set (SEC requires a name and contact email, e.g. "Covenant Compass you@example.com")')
    }

    const cacheFile = cachePath(url)
    if (await isFresh(cacheFile, maxAgeMs)) return readFile(cacheFile, 'utf8')

    for (let attempt = 1; ; attempt++) {
        await throttle()
        const res = await fetch(url, { headers: { 'User-Agent': userAgent } })
        if (res.ok) {
            const text = await res.text()
            await mkdir(path.dirname(cacheFile), { recursive: true })
            await writeFile(cacheFile, text)
            return text
        }
        const retryable = res.status === 429 || res.status >= 500
        if (!retryable || attempt >= MAX_ATTEMPTS) {
            throw new Error(`EDGAR request failed (${res.status}) after ${attempt} attempt(s): ${url}`)
        }
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1))
    }
}

export async function edgarJson<T = unknown>(url: string, options?: { maxAgeMs?: number }): Promise<T> {
    return JSON.parse(await edgarFetch(url, options)) as T
}

export function padCik(cik: string | number): string {
    const digits = String(cik).trim().replace(/^CIK/i, '')
    if (!/^\d{1,10}$/.test(digits)) throw new Error(`Invalid CIK: ${cik}`)
    return digits.padStart(10, '0')
}

export type Submissions = {
    cik: string
    name: string
    filings: {
        recent: {
            accessionNumber: string[]
            form: string[]
            filingDate: string[]
            primaryDocument: string[]
        }
    }
}

export function getSubmissions(cik: string | number): Promise<Submissions> {
    return edgarJson<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`, { maxAgeMs: ONE_DAY_MS })
}

export function getCompanyFacts(cik: string | number): Promise<unknown> {
    return edgarJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`, { maxAgeMs: ONE_DAY_MS })
}

export function filingFolderUrl(cik: string | number, accessionNumber: string): string {
    return `https://www.sec.gov/Archives/edgar/data/${Number(padCik(cik))}/${accessionNumber.replace(/-/g, '')}`
}

export function filingDocUrl(cik: string | number, accessionNumber: string, filename: string): string {
    return `${filingFolderUrl(cik, accessionNumber)}/${filename}`
}

async function throttle() {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
}

async function isFresh(file: string, maxAgeMs?: number) {
    const info = await stat(file).catch(() => null)
    if (!info) return false
    return maxAgeMs === undefined || Date.now() - info.mtimeMs < maxAgeMs
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function cachePath(url: string) {
    const hash = createHash('sha256').update(url).digest('hex')
    return path.join(process.env.EDGAR_CACHE_DIR || path.join('.cache', 'edgar'), hash)
}
