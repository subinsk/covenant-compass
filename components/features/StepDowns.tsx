import { AlertTriangle } from 'lucide-react'
import { parseFromDate, type StepDown } from '@/lib/covenants/test'

// The later limits of an extracted covenant, for review. A step-down whose start
// date can't be read is flagged: it won't be applied when values are tested.
export function StepDownList({ operator, stepDowns }: { operator: string; stepDowns: StepDown[] }) {
    if (stepDowns.length === 0) return null
    return (
        <ul className="space-y-0.5 text-sm">
            {stepDowns.map((step, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-1.5">
                    <span className="text-muted-foreground">then</span>
                    <span className="font-mono font-semibold">{operator} {step.limit}</span>
                    <span className="text-muted-foreground">from {step.from}</span>
                    {parseFromDate(step.from) === null && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600" title="Only dates like 2027-06-30 or June 30, 2027 can be applied. Until this is fixed, the earlier limit keeps applying after this step.">
                            <AlertTriangle className="h-3 w-3" />
                            date not recognised, won&apos;t be applied
                        </span>
                    )}
                </li>
            ))}
        </ul>
    )
}
