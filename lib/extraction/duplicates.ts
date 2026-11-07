import type { Prisma, PrismaClient } from '@prisma/client'

// Spotting extracted covenants the facility already has, so importing the same
// agreement twice (or after adding covenants by hand) doesn't double the schedule.

export type ExistingCovenant = { id: string, title: string, metric: string | null }

// 'Maximum Total Leverage Ratio' and 'maximum total-leverage ratio.' read the same.
export function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Words that qualify a covenant title without changing which test it is.
const FILLER = new Set(['maximum', 'minimum', 'max', 'min', 'ratio', 'the', 'of', 'covenant', 'consolidated'])

function keyWords(title: string): Set<string> {
    return new Set(normalizeTitle(title).split(' ').filter(word => word && !FILLER.has(word)))
}

// True when every key word of one title is in the other: 'Leverage Ratio' and
// 'Maximum Total Net Leverage Ratio', but not 'Interest Coverage' and 'Fixed Charge Coverage'.
export function titlesOverlap(a: string, b: string): boolean {
    const [x, y] = [keyWords(a), keyWords(b)]
    if (x.size === 0 || y.size === 0) return normalizeTitle(a) === normalizeTitle(b)
    const within = (small: Set<string>, big: Set<string>) => [...small].every(word => big.has(word))
    return within(x, y) || within(y, x)
}

// The facility's covenant this one likely duplicates: same metric (known when the covenant was
// approved from an extraction), or overlapping titles (the only clue for covenants added by hand).
// A heuristic for a warning, not a guarantee. Null when there's no match.
export function findDuplicate(candidate: { name: string, metric: string }, existing: ExistingCovenant[]): ExistingCovenant | null {
    return existing.find(c => (c.metric !== null && c.metric === candidate.metric) || titlesOverlap(c.title, candidate.name)) ?? null
}

type Db = PrismaClient | Prisma.TransactionClient

// Active covenants on the given facilities, with the metric they were extracted as, if any.
export async function existingCovenants(db: Db, facilityIds: string[]): Promise<Map<string, ExistingCovenant[]>> {
    const covenants = await db.covenant.findMany({
        where: { facilityId: { in: facilityIds }, active: true },
        select: { id: true, title: true, facilityId: true, extractions: { select: { metric: true }, take: 1 } },
    })
    const byFacility = new Map<string, ExistingCovenant[]>()
    for (const c of covenants) {
        const list = byFacility.get(c.facilityId) ?? []
        list.push({ id: c.id, title: c.title, metric: c.extractions[0]?.metric ?? null })
        byFacility.set(c.facilityId, list)
    }
    return byFacility
}
