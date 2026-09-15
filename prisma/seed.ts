import { PrismaClient, Frequency, Importance, OwnerRole, UserRole, OrgType, FacilityStatus, CovenantType, OccurrenceStatus, RagStatus } from '@prisma/client'
import { addDays, subDays, addMonths, subMonths, startOfYear } from 'date-fns'
import 'dotenv/config'

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
})

const COMPANIES = ['Globex', 'Soylent Corp', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Massive Dynamic', 'Cyberdyne Systems']
const FACILITY_TYPES = ['Term Loan A', 'Revolver', 'Bridge Loan', 'Mezzanine Debt', 'Equipment Finance']
const COVENANT_TEMPLATES = [
    { title: 'Net Leverage Ratio', type: CovenantType.FINANCIAL, desc: 'Maintain Net Leverage below 4.0x', formula: 'NetDebt / EBITDA' },
    { title: 'Interest Coverage', type: CovenantType.FINANCIAL, desc: 'Maintain Interest Coverage above 3.0x', formula: 'EBITDA / Interest' },
    { title: 'Annual Audited Financials', type: CovenantType.REPORTING, desc: 'Deliver audited financials within 120 days of YE', freq: Frequency.ANNUAL },
    { title: 'Quarterly Compliance Cert', type: CovenantType.REPORTING, desc: 'Deliver cert within 45 days of QE', freq: Frequency.QUARTERLY },
    { title: 'Monthly Borrowing Base', type: CovenantType.REPORTING, desc: 'Deliver BBC within 15 days of ME', freq: Frequency.MONTHLY },
    { title: 'Capex Limit', type: CovenantType.FINANCIAL, desc: 'Annual Capex not to exceed $10M', freq: Frequency.ANNUAL },
    { title: 'Insurance Renewal', type: CovenantType.GENERAL, desc: 'Provide proof of insurance renewal', freq: Frequency.ANNUAL },
    { title: 'ESG Compliance Report', type: CovenantType.ESG, desc: 'Annual sustainability report', freq: Frequency.ANNUAL },
]

async function main() {
    console.log('Start large scale seeding...')

    // Cleanup
    await prisma.notification.deleteMany()
    await prisma.document.deleteMany()
    await prisma.covenantOccurrence.deleteMany()
    await prisma.covenant.deleteMany()
    await prisma.facility.deleteMany()
    await prisma.user.deleteMany()
    await prisma.organization.deleteMany()

    // 1. Organizations
    const lenderOrg = await prisma.organization.create({ data: { name: 'Acme Capital Partners', type: OrgType.LENDER } })

    const borrowers = []
    for (const name of COMPANIES) {
        borrowers.push(await prisma.organization.create({ data: { name: name, type: OrgType.BORROWER } }))
    }

    // 2. Users
    const lenderAdmin = await prisma.user.create({
        data: { name: 'Alice Lender', email: 'alice@acmecapital.com', passwordHash: 'hashed_secret', role: UserRole.LENDER_ADMIN, organizationId: lenderOrg.id }
    })

    // Create random users
    for (let i = 0; i < 5; i++) {
        await prisma.user.create({
            data: { name: `Lender User ${i}`, email: `user${i}@acmecapital.com`, passwordHash: 'hashed_secret', role: UserRole.LENDER_USER, organizationId: lenderOrg.id }
        })
    }

    // 3. Facilities
    const facilities = []
    const now = new Date()

    for (let i = 0; i < 50; i++) {
        const borrower = borrowers[Math.floor(Math.random() * borrowers.length)]
        const type = FACILITY_TYPES[Math.floor(Math.random() * FACILITY_TYPES.length)]
        const amount = (Math.floor(Math.random() * 90) + 10) * 1000000 // 10M to 100M

        // Randomly set legacy start dates (up to 3 years ago)
        const startDate = subMonths(now, Math.floor(Math.random() * 36))
        const durationMonths = 24 + Math.floor(Math.random() * 48) // 2-6 years
        const endDate = addMonths(startDate, durationMonths)

        // Status
        let status = FacilityStatus.ACTIVE
        if (endDate < now) status = FacilityStatus.MATURED

        const f = await prisma.facility.create({
            data: {
                name: `${borrower.name} - ${type}`,
                facilityReference: `FAC-${2024000 + i}`,
                currency: 'USD',
                totalCommitment: amount,
                startDate,
                endDate,
                status,
                description: `Standard ${type} facility.`,
                lenderOrgId: lenderOrg.id,
                borrowerOrgId: borrower.id,
                createdByUserId: lenderAdmin.id,
                updatedByUserId: lenderAdmin.id
            }
        })
        facilities.push(f)
    }

    // 4. Covenants and Occurrences
    for (const fac of facilities) {
        const numCovenants = 3 + Math.floor(Math.random() * 5) // 3-8 covenants per facility

        for (let j = 0; j < numCovenants; j++) {
            const template = COVENANT_TEMPLATES[Math.floor(Math.random() * COVENANT_TEMPLATES.length)]
            const freq = template.freq || (Math.random() > 0.5 ? Frequency.QUARTERLY : Frequency.MONTHLY)

            const cov = await prisma.covenant.create({
                data: {
                    facilityId: fac.id,
                    title: template.title,
                    type: template.type,
                    description: template.desc,
                    frequency: freq,
                    dueRule: '30 days after period end',
                    ownerRole: OwnerRole.BORROWER,
                    importance: Math.random() > 0.7 ? Importance.HIGH : Importance.MEDIUM,
                    metricFormula: template.formula,
                }
            })

            // Generate Occurrences (Mock Schedule Engine)
            let current = new Date(fac.startDate)
            const facEnd = new Date(fac.endDate)

            while (current < facEnd) {
                let next = addMonths(current, freq === 'MONTHLY' ? 1 : freq === 'QUARTERLY' ? 3 : 12)
                if (next > facEnd) next = facEnd

                const dueDate = addDays(next, 30) // 30 days due rule

                // Determine Status
                let status = OccurrenceStatus.PENDING
                let rag = RagStatus.GREEN

                if (dueDate < now) {
                    // Past item
                    const rand = Math.random()
                    if (rand > 0.3) {
                        status = OccurrenceStatus.COMPLETED
                        rag = RagStatus.GREEN
                    } else if (rand > 0.1) {
                        status = OccurrenceStatus.OVERDUE
                        rag = RagStatus.RED
                    } else {
                        // Waived
                        status = OccurrenceStatus.WAIVED
                        rag = RagStatus.GREEN
                    }
                } else {
                    // Future item
                    // Maybe some are approaching?
                    if (dueDate < addDays(now, 7)) {
                        rag = RagStatus.AMBER // Approaching
                    }
                }

                await prisma.covenantOccurrence.create({
                    data: {
                        covenantId: cov.id,
                        facilityId: fac.id,
                        periodStartDate: current,
                        periodEndDate: subDays(next, 1),
                        dueDate: dueDate,
                        status: status,
                        ragStatus: rag,
                        completionDate: status === 'COMPLETED' ? subDays(dueDate, 5) : null
                    }
                })

                current = next
            }
        }
    }

    console.log(`Seeding complete: ${facilities.length} Facilities created with Covenants and Occurrences.`)
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
