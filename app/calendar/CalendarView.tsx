'use client'

import { useState } from 'react'
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, format, startOfWeek, endOfWeek } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Prisma } from '@prisma/client'

type CalendarOccurrence = Prisma.CovenantOccurrenceGetPayload<{ include: { facility: true; covenant: true } }>

export default function CalendarView({ occurrences }: { occurrences: CalendarOccurrence[] }) {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)

    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

    const getEventsForDay = (date: Date) => {
        return occurrences.filter(occ => isSameDay(new Date(occ.dueDate), date))
    }

    const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Compliance Calendar</h1>
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                    <h2 className="text-lg font-semibold min-w-[150px] text-center">{format(currentDate, 'MMMM yyyy')}</h2>
                    <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Calendar Grid */}
                <Card className="md:col-span-2">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-7 mb-2 text-center text-sm font-medium text-muted-foreground">
                            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map((day, idx) => {
                                const isCurrentMonth = isSameMonth(day, currentDate)
                                const events = getEventsForDay(day)
                                const isSelected = selectedDate && isSameDay(day, selectedDate)

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedDate(day)}
                                        className={`
                                      h-24 p-2 border rounded-md flex flex-col items-start justify-start transition-colors
                                      ${!isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-card'}
                                      ${isSelected ? 'ring-2 ring-primary z-10' : 'hover:bg-accent'}
                                  `}
                                    >
                                        <span className={`text-sm ${isSameDay(day, new Date()) ? 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center -ml-1 -mt-1' : ''}`}>
                                            {format(day, 'd')}
                                        </span>

                                        <div className="flex flex-wrap gap-1 mt-auto w-full">
                                            {events.slice(0, 4).map((evt) => (
                                                <div
                                                    key={evt.id}
                                                    className={`w-2 h-2 rounded-full ${evt.ragStatus === 'RED' ? 'bg-red-500' :
                                                            evt.ragStatus === 'AMBER' ? 'bg-amber-500' :
                                                                evt.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-slate-300'
                                                        }`}
                                                    title={evt.covenant.title}
                                                />
                                            ))}
                                            {events.length > 4 && <span className="text-[10px] text-muted-foreground">+</span>}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Side Panel for Selected Day */}
                <Card>
                    <CardHeader>
                        <CardTitle>{selectedDate ? format(selectedDate, 'EEEE, MMMM do') : 'Select a date'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedDate && selectedDayEvents.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No obligations due on this day.</p>
                        ) : (
                            <div className="space-y-4">
                                {selectedDayEvents.map((evt) => (
                                    <div key={evt.id} className="border-b last:border-0 pb-3">
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="font-medium text-sm line-clamp-2">{evt.covenant.title}</p>
                                            <Badge variant={evt.status === 'OVERDUE' ? 'destructive' : evt.status === 'COMPLETED' ? 'success' : 'secondary'} className="text-[10px] px-1 py-0 h-5">
                                                {evt.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-1">{evt.facility.name}</p>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className={`w-2 h-2 rounded-full ${evt.ragStatus === 'RED' ? 'bg-red-500' : evt.ragStatus === 'AMBER' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                            <span className="capitalize">{evt.ragStatus.toLowerCase()} Health</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
