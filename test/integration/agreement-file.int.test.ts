import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import * as uploadRunRoute from '@/app/api/facilities/[facilityId]/extraction-runs/route'
import * as agreementFileRoute from '@/app/api/extraction-runs/[id]/file/route'
import * as edgarImportRoute from '@/app/api/extraction-runs/route'
import { seedTwoTenants } from './fixtures'
import { readFile } from '@/lib/storage/files'

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }))
// Never run a real extraction; the upload only needs to store the file and start a run.
vi.mock('@/lib/extraction/import', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/extraction/import')>(),
    runExtraction: vi.fn(async () => 'DONE'),
}))
vi.mock('next/server', async (importOriginal) => ({
    ...await importOriginal<typeof import('next/server')>(),
    after: () => {},
}))

type Fixtures = Awaited<ReturnType<typeof seedTwoTenants>>

const signInAs = (session: SessionPayload) => vi.mocked(getSession).mockResolvedValue(session)

describe.skipIf(!process.env.DATABASE_URL_TEST)('uploaded agreements are stored (real database)', () => {
    let f: Fixtures

    beforeEach(async () => {
        f = await seedTwoTenants()
        vi.stubEnv('LLM_BASE_URL', 'http://llm.invalid')
        vi.stubEnv('LLM_MODEL', 'test-model')
    })
    afterEach(() => vi.unstubAllEnvs())

    it("stores the upload and serves it only to the facility's lender", async () => {
        signInAs(f.sessions.bankA)
        const text = 'The Borrower shall not permit the Leverage Ratio to exceed 3.50:1.00.'
        const form = new FormData()
        form.append('file', new File([text], 'Credit Agreement.pdf'))
        const res = await uploadRunRoute.POST(new Request('http://localhost/x', { method: 'POST', body: form }), { params: Promise.resolve({ facilityId: f.facilityA.id }) })
        expect(res.status).toBe(202)
        const run = await prisma.extractionRun.findUniqueOrThrow({ where: { id: (await res.json()).id } })
        expect(run.fileKey).toBe(`${run.id}-Credit_Agreement.pdf`)

        const download = () => agreementFileRoute.GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: run.id }) })
        const file = await download()
        expect(file.status).toBe(200)
        expect(file.headers.get('content-type')).toBe('application/pdf')
        expect(file.headers.get('content-disposition')).toMatch(/^inline/)
        expect(await file.text()).toBe(text)

        signInAs(f.sessions.bankB)
        expect((await download()).status).toBe(404)
        signInAs(f.sessions.acme)
        expect((await download()).status).toBe(403)
    })

    it('refuses agreements for a matured or defaulted facility, by upload or from EDGAR', async () => {
        signInAs(f.sessions.bankA)
        await prisma.facility.update({ where: { id: f.facilityA.id }, data: { status: 'MATURED' } })

        const form = new FormData()
        form.append('file', new File(['Leverage Ratio not to exceed 3.50:1.00.'], 'Agreement.txt'))
        const upload = await uploadRunRoute.POST(new Request('http://localhost/x', { method: 'POST', body: form }), { params: Promise.resolve({ facilityId: f.facilityA.id }) })
        expect(upload.status).toBe(400)
        expect((await upload.json()).error).toMatch(/active facilities/)

        const edgar = await edgarImportRoute.POST(new Request('http://localhost/x', {
            method: 'POST',
            body: JSON.stringify({ facilityId: f.facilityA.id, url: 'https://www.sec.gov/Archives/edgar/data/1/000000000000000000/ex10.htm' }),
        }))
        expect(edgar.status).toBe(400)
        expect(await prisma.extractionRun.count({ where: { facilityId: f.facilityA.id } })).toBe(0)
    })

    it('removes the stored file when the run cannot be created', async () => {
        signInAs(f.sessions.bankA)
        // Reusing an existing run's id makes the insert fail on the primary key.
        const existing = await prisma.extractionRun.create({ data: { facilityId: f.facilityA.id, sourceName: 'old.pdf', model: 'm', promptChars: 0 } })
        const runId = existing.id
        vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(runId as ReturnType<typeof crypto.randomUUID>)

        const form = new FormData()
        form.append('file', new File(['Leverage Ratio not to exceed 3.50:1.00.'], 'Agreement.txt'))
        const res = await uploadRunRoute.POST(new Request('http://localhost/x', { method: 'POST', body: form }), { params: Promise.resolve({ facilityId: f.facilityA.id }) })

        expect(res.status).toBe(500)
        await expect(readFile(`${runId}-Agreement.txt`)).rejects.toThrow()
    })

    it('returns 404 for an EDGAR run, which has no stored file', async () => {
        signInAs(f.sessions.bankA)
        const run = await prisma.extractionRun.create({ data: { facilityId: f.facilityA.id, sourceUrl: 'https://www.sec.gov/x.htm', model: 'm', promptChars: 0 } })
        expect((await agreementFileRoute.GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: run.id }) })).status).toBe(404)
    })
})
