import Link from 'next/link'
import { MailCheck, MailX } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { hashInviteToken, INVITE_STATUS_MESSAGES, inviteStatus, MIN_PASSWORD_LENGTH } from '@/lib/auth/invite'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/core'
import { AcceptInviteForm } from './AcceptInviteForm'

// Public page an invited borrower user opens to set up their account.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const user = await prisma.user.findFirst({
        where: { inviteTokenHash: hashInviteToken(token) },
        select: { name: true, email: true, passwordHash: true, inviteExpiresAt: true, organization: { select: { name: true } } },
    })
    const status = inviteStatus(user)

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
            <Card className="w-full max-w-md">
                {status === 'valid' && user ? (
                    <>
                        <CardHeader className="text-center">
                            <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4 text-primary">
                                <MailCheck className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-2xl">Join {user.organization.name}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Set up your Covenant Compass account for <span className="font-medium text-foreground">{user.email}</span>.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <AcceptInviteForm token={token} initialName={user.name} minLength={MIN_PASSWORD_LENGTH} />
                        </CardContent>
                    </>
                ) : (
                    <>
                        <CardHeader className="text-center">
                            <div className="mx-auto bg-destructive/10 w-12 h-12 rounded-full flex items-center justify-center mb-4 text-destructive">
                                <MailX className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-2xl">Invite unavailable</CardTitle>
                            <p className="text-sm text-muted-foreground">{INVITE_STATUS_MESSAGES[status === 'expired' ? 'expired' : 'invalid']}</p>
                        </CardHeader>
                        <CardContent className="text-center">
                            <Link href="/login" className="text-sm font-medium text-primary hover:underline">Go to sign in</Link>
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    )
}
