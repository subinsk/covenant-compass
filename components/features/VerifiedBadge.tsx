import { Badge } from '@/components/ui/core'

// Whether an extracted covenant's quote was found word for word in the agreement.
// Used wherever extracted covenants are reviewed, so the check reads the same everywhere.
export function VerifiedBadge({ verified }: { verified: boolean }) {
    return verified
        ? <Badge variant="success" title="The quote was found word for word in the agreement">Verified</Badge>
        : <Badge variant="destructive" title="The quote wasn't found in the agreement. Check it against the source before approving.">Not verified</Badge>
}
