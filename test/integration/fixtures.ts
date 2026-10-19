import { prisma } from '@/lib/prisma'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { UserRole } from '@prisma/client'

// Two independent lending relationships: Bank A lends to Acme, Bank B lends to Globex.
// Each facility has one covenant with one occurrence.
export async function seedTwoTenants() {
    await clearDatabase()

    const bankA = await prisma.organization.create({ data: { name: 'Bank A', type: 'LENDER' } })
    const bankB = await prisma.organization.create({ data: { name: 'Bank B', type: 'LENDER' } })
    const acme = await prisma.organization.create({ data: { name: 'Acme', type: 'BORROWER' } })
    const globex = await prisma.organization.create({ data: { name: 'Globex', type: 'BORROWER' } })

    const users = {
        bankA: await createUser('lender@bank-a.test', 'LENDER_ADMIN', bankA.id),
        bankB: await createUser('lender@bank-b.test', 'LENDER_ADMIN', bankB.id),
        acme: await createUser('cfo@acme.test', 'BORROWER_USER', acme.id),
        globex: await createUser('cfo@globex.test', 'BORROWER_USER', globex.id),
    }

    const facilityA = await createFacility('Facility A', bankA.id, acme.id, users.bankA.id)
    const facilityB = await createFacility('Facility B', bankB.id, globex.id, users.bankB.id)

    return {
        orgs: { bankA, bankB, acme, globex },
        sessions: {
            bankA: sessionFor(users.bankA),
            bankB: sessionFor(users.bankB),
            acme: sessionFor(users.acme),
            globex: sessionFor(users.globex),
        },
        facilityA,
        facilityB,
    }
}

export async function clearDatabase() {
    await prisma.covenantOccurrence.deleteMany()
    await prisma.covenant.deleteMany()
    await prisma.facility.deleteMany()
    await prisma.user.deleteMany()
    await prisma.organization.deleteMany()
}

function createUser(email: string, role: UserRole, organizationId: string) {
    return prisma.user.create({
        data: { name: email, email, passwordHash: 'not-used', role, organizationId },
    })
}

function sessionFor(user: { id: string; email: string; role: string; organizationId: string }): SessionPayload {
    return { userId: user.id, email: user.email, role: user.role, orgId: user.organizationId }
}

async function createFacility(name: string, lenderOrgId: string, borrowerOrgId: string, userId: string) {
    const facility = await prisma.facility.create({
        data: {
            name,
            facilityReference: `REF-${name}`,
            lenderOrgId,
            borrowerOrgId,
            currency: 'USD',
            totalCommitment: 1_000_000,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2028-01-01'),
            status: 'ACTIVE',
            createdByUserId: userId,
            updatedByUserId: userId,
        },
    })
    const covenant = await prisma.covenant.create({
        data: {
            facilityId: facility.id,
            title: `${name} leverage`,
            type: 'FINANCIAL',
            frequency: 'QUARTERLY',
            ownerRole: 'BORROWER',
            importance: 'HIGH',
        },
    })
    const occurrence = await prisma.covenantOccurrence.create({
        data: { covenantId: covenant.id, facilityId: facility.id, dueDate: new Date('2026-04-30') },
    })
    return { ...facility, covenant, occurrence }
}
