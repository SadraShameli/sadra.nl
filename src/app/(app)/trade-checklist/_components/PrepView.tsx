'use client';

import { useMemo, useState } from 'react';

import type { DailyPreparationRow } from '~/lib/schemas/trading';
import type { PrepChecks } from '~/lib/trading-types';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';

import { PrepChecklist } from './prep/PrepChecklist';
import { PrepHistoryStrip } from './prep/PrepHistoryStrip';

interface PrepViewProps {
    activePlanId: null | string;
    history: DailyPreparationRow[];
    today: string;
}

const EMPTY_CHECKS: PrepChecks = {
    accountRiskReset: false,
    economicEventsChecked: false,
    htfBiasConfirmed: false,
    journalReviewed: false,
    keyLevelsMarked: false,
    mentalCheckIn: false,
    setupPlanWritten: false,
};

export function PrepView({ activePlanId, history, today }: PrepViewProps) {
    const todayRow = useMemo(
        () => history.find((h) => h.date === today) ?? null,
        [history, today],
    );
    const [selectedDate, setSelectedDate] = useState<string>(today);

    const selectedRow = useMemo(
        () => history.find((h) => h.date === selectedDate) ?? null,
        [history, selectedDate],
    );

    const isToday = selectedDate === today;
    const initialChecks = selectedRow?.checks ?? EMPTY_CHECKS;
    const initialNotes = selectedRow?.notes ?? '';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {isToday ? "Today's prep" : `Prep for ${selectedDate}`}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <PrepChecklist
                        date={selectedDate}
                        existing={selectedRow}
                        initialChecks={initialChecks}
                        initialNotes={initialNotes}
                        isToday={isToday}
                        key={selectedDate}
                        planId={activePlanId}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Last 30 days</CardTitle>
                </CardHeader>
                <CardContent>
                    <PrepHistoryStrip
                        history={history}
                        onSelect={setSelectedDate}
                        selectedDate={selectedDate}
                        today={today}
                        todayRow={todayRow}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
