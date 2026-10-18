'use client';

import { useMemo, useState } from 'react';

import type { DailyPreparationRow } from '~/lib/schemas/tradingRows';
import type { PrepChecks } from '~/lib/trading/types';

import { ToolPanel } from '~/components/ToolPanel';
import { formatDisplayDate } from '~/lib/format';
import { cn } from '~/lib/utilities';

import { PrepChecklist } from './prep/PrepChecklist';
import { PrepHistoryStrip } from './prep/PrepHistoryStrip';

interface PrepViewProperties {
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

export function PrepView({ activePlanId, history, today }: PrepViewProperties) {
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
        <div
            className={cn(
                'app-trade-checklist__prep-view',
                'flex flex-col gap-6',
            )}
        >
            <ToolPanel
                title={
                    isToday
                        ? "Today's prep"
                        : `Prep for ${formatDisplayDate(selectedDate)}`
                }
            >
                <PrepChecklist
                    date={selectedDate}
                    existing={selectedRow}
                    initialChecks={initialChecks}
                    initialNotes={initialNotes}
                    isToday={isToday}
                    key={selectedDate}
                    planId={activePlanId}
                />
            </ToolPanel>

            <ToolPanel title="Last 30 days">
                <PrepHistoryStrip
                    history={history}
                    onSelect={setSelectedDate}
                    selectedDate={selectedDate}
                    today={today}
                    todayRow={todayRow}
                />
            </ToolPanel>
        </div>
    );
}
