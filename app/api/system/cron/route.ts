import { NextResponse } from 'next/server'
import { updateComplianceStatuses } from '@/lib/services/rag-engine'
import { isAuthorizedCron } from '@/lib/auth/cron'

// GET /api/system/cron — daily compliance status job, called by Vercel Cron.
export async function GET(request: Request) {
    if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const stats = await updateComplianceStatuses()
        return NextResponse.json({ success: true, stats })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: 'Job failed' }, { status: 500 })
    }
}
