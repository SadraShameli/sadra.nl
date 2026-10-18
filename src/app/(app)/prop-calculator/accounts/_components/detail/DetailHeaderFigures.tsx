'use client';

import { TriangleAlert } from 'lucide-react';

import {
    ExpectedPayoutsValue,
    NextActionValue,
    NextPayoutValue,
    ValueDetailLines,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountValueCells';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import {
    type AccountValues,
    hasPendingValues,
} from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import { StatStrip } from '~/components/StatStrip';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Skeleton } from '~/components/ui/skeleton';

import { FROM_STATE_PERSONAL_RULES_NOTE } from './fromStateDetail';

export function DetailHeaderFigures({
    accountId,
    values,
}: {
    readonly accountId: string;
    readonly values: AccountValues;
}) {
    const columns = values.columns.get(accountId);
    if (values.notice !== null) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Values could not be computed</AlertTitle>
                <AlertDescription>{values.notice}</AlertDescription>
            </Alert>
        );
    }
    if (columns === undefined) {
        return (
            <div
                aria-busy="true"
                aria-label="Computing the value and next action"
                role="status"
            >
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }
    const { action, expectedPayouts, nextPayout } = columns;
    const hasExpectedPayoutsCaption =
        columns.atRisk !== null || columns.evPerAttempt !== null;
    return (
        <div
            aria-busy={hasPendingValues(values)}
            className="flex flex-col gap-2"
        >
            <StatStrip
                items={[
                    {
                        caption:
                            action.reason === null
                                ? undefined
                                : sentenceOf(action.reason),
                        id: 'next-action',
                        label: 'Next action',
                        value: <NextActionValue action={action} />,
                    },
                    {
                        caption: hasExpectedPayoutsCaption ? (
                            <ValueDetailLines columns={columns} />
                        ) : undefined,
                        id: 'expected-payouts',
                        label: 'Expected payouts',
                        value: (
                            <ExpectedPayoutsValue
                                expectedPayouts={expectedPayouts}
                            />
                        ),
                    },
                    {
                        caption: nextPayout.note ?? undefined,
                        id: 'next-payout',
                        label: 'Next payout',
                        value: <NextPayoutValue nextPayout={nextPayout} />,
                    },
                ]}
                label="Value and next action"
            />
            <p className="text-xs text-muted-foreground">
                {FROM_STATE_PERSONAL_RULES_NOTE}
            </p>
        </div>
    );
}
