import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { suggestWithFallback } from '@/lib/extraction/clause'

export async function POST(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { clauseText } = await request.json()
        const suggestion = await suggestWithFallback(typeof clauseText === 'string' ? clauseText : '')
        return NextResponse.json(suggestion)
    } catch {
        return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
    }
}
