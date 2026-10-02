'use client';

import { TriangleAlert } from 'lucide-react';

import {
    ExpectedPayoutsFigure,
    NextActionFigure,
    NextPayoutFigure,
    ValueDetailLines,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountValueCells';
import {
    type AccountValues,
    hasPendingValues,
} from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Skeleton } from '~/components/ui/Skeleton';

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
            <Alert variant="warning">
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
    return (
        <div className="flex flex-col gap-2">
            <dl
                aria-busy={hasPendingValues(values)}
                aria-label="Value and next action"
                className="grid gap-x-8 gap-y-4 sm:grid-cols-3"
            >
                <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                        Next action
                    </dt>
                    <dd>
                        <NextActionFigure action={columns.action} />
                    </dd>
                </div>
                <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                        Expected payouts
                    </dt>
                    <dd>
                        <ExpectedPayoutsFigure
                            expectedPayouts={columns.expectedPayouts}
                        />
                        <ValueDetailLines columns={columns} />
                    </dd>
                </div>
                <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                        Next payout
                    </dt>
                    <dd>
                        <NextPayoutFigure nextPayout={columns.nextPayout} />
                    </dd>
                </div>
            </dl>
            <p className="text-xs text-muted-foreground">
                {FROM_STATE_PERSONAL_RULES_NOTE}
            </p>
        </div>
    );
}
