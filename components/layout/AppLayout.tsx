'use client'
import { LayoutDashboard, FileText, Calendar, Bell, LogOut, FileStack, ClipboardCheck, ChartLine, Building2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/components/ui/core'

export default function AppLayout({ children, isBorrower }: { children: React.ReactNode; isBorrower: boolean }) {
    const pathname = usePathname()
    const router = useRouter()

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
        } catch (e) {
            console.error('Logout failed', e)
        }
    }

    // Don't show layout on login
    if (pathname === '/login') return <>{children}</>

    // Borrowers only have the portal; the lender pages redirect them there.
    const navItems = isBorrower
        ? [{ href: '/portal', label: 'Portal', icon: LayoutDashboard }]
        : [
            { href: '/', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/facilities', label: 'Facilities', icon: FileStack },
            { href: '/borrowers', label: 'Borrowers', icon: Building2 },
            { href: '/calendar', label: 'Calendar', icon: Calendar },
            { href: '/reports', label: 'Reports', icon: FileText },
            { href: '/review', label: 'Review', icon: ClipboardCheck },
            { href: '/analytics', label: 'Analytics', icon: ChartLine },
        ]

    return (
        <div className="min-h-screen flex bg-background">
            {/* Sidebar */}
            <aside className="w-64 border-r bg-card hidden md:flex flex-col">
                <div className="p-6 border-b">
                    <h1 className="text-xl font-bold text-primary tracking-tight">CovenantCompass</h1>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="p-4 border-t">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 w-full rounded-md transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Log Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                {/* Pages show their own title, so the header only holds actions */}
                <header className="h-16 border-b bg-card flex items-center justify-end px-6 sticky top-0 z-10 w-full">
                    <div className="flex items-center gap-4">
                        <button className="relative p-2 rounded-full hover:bg-accent text-muted-foreground">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full border border-card" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                            AL
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-6 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
