'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { LightAssessment } from '~/lib/trading/analytics';

import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { formatDisplayMonth } from '~/lib/format';
import { cn } from '~/lib/utilities';

import { CalendarHeatmap } from './calendar/CalendarHeatmap';
import { DayOfWeekChart } from './calendar/DayOfWeekChart';
import { StreaksPanel } from './calendar/StreaksPanel';

interface CalendarViewProperties {
    assessments: LightAssessment[];
    month: string;
}

export function CalendarView({ assessments, month }: CalendarViewProperties) {
    const previousMonth = shiftMonth(month, -1);
    const nextMonth = shiftMonth(month, 1);

    return (
        <div
            className={cn(
                'app-trade-checklist__calendar-view',
                'flex flex-col gap-6',
            )}
        >
            <StreaksPanel assessments={assessments} />

            <ToolPanel
                actions={
                    <div className="flex items-center gap-1">
                        <Button asChild size="icon" variant="ghost">
                            <Link href={`?month=${previousMonth}`}>
                                <ChevronLeft className="size-4" />
                            </Link>
                        </Button>
                        <Button asChild size="icon" variant="ghost">
                            <Link href={`?month=${nextMonth}`}>
                                <ChevronRight className="size-4" />
                            </Link>
                        </Button>
                    </div>
                }
                title={formatDisplayMonth(month)}
            >
                <CalendarHeatmap assessments={assessments} month={month} />
            </ToolPanel>

            <ToolPanel title="Day-of-week edge">
                <DayOfWeekChart assessments={assessments} />
            </ToolPanel>
        </div>
    );
}

function shiftMonth(month: string, delta: number): string {
    const [yString, mString] = month.split('-', 2);
    const y = Number(yString);
    const m = Number(mString);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
