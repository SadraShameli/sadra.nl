'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { LightAssessment } from '~/lib/trading-analytics';

import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { cn } from '~/lib/utils';

import { CalendarHeatmap } from './calendar/CalendarHeatmap';
import { DayOfWeekChart } from './calendar/DayOfWeekChart';
import { StreaksPanel } from './calendar/StreaksPanel';

interface CalendarViewProps {
    assessments: LightAssessment[];
    month: string;
}

export function CalendarView({ assessments, month }: CalendarViewProps) {
    const prevMonth = shiftMonth(month, -1);
    const nextMonth = shiftMonth(month, 1);

    return (
        <div
            className={cn(
                'app-trade-checklist__calendar-view',
                'flex flex-col gap-6',
            )}
        >
            <StreaksPanel assessments={assessments} />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                        {formatMonthLabel(month)}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Button asChild size="icon" variant="ghost">
                            <Link href={`?month=${prevMonth}`}>
                                <ChevronLeft className="size-4" />
                            </Link>
                        </Button>
                        <Button asChild size="icon" variant="ghost">
                            <Link href={`?month=${nextMonth}`}>
                                <ChevronRight className="size-4" />
                            </Link>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <CalendarHeatmap assessments={assessments} month={month} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Day-of-week edge
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <DayOfWeekChart assessments={assessments} />
                </CardContent>
            </Card>
        </div>
    );
}

function formatMonthLabel(month: string): string {
    const [yStr, mStr] = month.split('-');
    const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 1));
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(d);
}

function shiftMonth(month: string, delta: number): string {
    const [yStr, mStr] = month.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
