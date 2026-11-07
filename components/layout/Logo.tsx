import { cn } from '@/components/ui/core'

// The compass mark. Drawn in the primary colour so it follows the theme.
export function LogoMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('w-8 h-8 shrink-0 text-primary', className)}>
            <rect width="32" height="32" rx="8" fill="currentColor" />
            <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
            <g transform="rotate(45 16 16)">
                <path d="M16 6.5 19 16h-6z" fill="#fff" />
                <path d="M16 25.5 13 16h6z" fill="#fff" fillOpacity="0.45" />
            </g>
            <circle cx="16" cy="16" r="1.6" fill="currentColor" />
        </svg>
    )
}

export function Logo({ className }: { className?: string }) {
    return (
        <span className={cn('flex items-center gap-2.5', className)}>
            <LogoMark />
            <span className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">
                Covenant Compass
            </span>
        </span>
    )
}
