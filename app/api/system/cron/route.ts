import { NextResponse } from 'next/server'
import { updateComplianceStatuses } from '@/lib/services/rag-engine'
import { headers } from 'next/headers'

// GET /api/system/cron
// In production, protect this with a CRON_SECRET header check
export async function GET(request: Request) {
    // const authHeader = headers().get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }

    try {
        const stats = await updateComplianceStatuses()
        return NextResponse.json({ success: true, stats })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: 'Job failed' }, { status: 500 })
    }
}
