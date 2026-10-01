'use client';

import { type ReactNode } from 'react';

import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';

import {
    type AdviceValueView,
    NO_LIVE_VALUE_TEXT,
    ValueSectionKind,
} from './adviceValueModel';
import { EvSwingRow } from './EvSwingRow';
import { OneStepTree } from './OneStepTree';
import { RiskCandidatesTable } from './RiskCandidatesTable';
import { AdviceValuesPhase, type AdviceValuesState } from './useAccountAdvice';

export function NextTradeValue({
    valueView,
}: {
    readonly valueView: AdviceValueView;
}) {
    if (valueView.swings.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No trade is placeable today, so there is no next trade to value.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <ul className="flex list-none flex-col gap-1">
                {valueView.swings.map((swing) => (
                    <EvSwingRow
                        key={
                            swing.kind === ValueSectionKind.Ready
                                ? swing.row.index
                                : swing.index
                        }
                        view={swing}
                    />
                ))}
            </ul>
            {valueView.tree !== null && <OneStepTree tree={valueView.tree} />}
            {valueView.boundaryNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {valueView.boundaryNote}
                </p>
            )}
        </div>
    );
}

export function RiskCandidates({
    valueView,
}: {
    readonly valueView: AdviceValueView;
}) {
    const { candidates } = valueView;
    if (candidates === null) {
        return (
            <p className="text-sm text-muted-foreground">
                No risk candidates were computed.
            </p>
        );
    }
    switch (candidates.kind) {
        case ValueSectionKind.Failed: {
            return (
                <p className="text-sm text-muted-foreground">
                    Left out: {candidates.reason}
                </p>
            );
        }
        case ValueSectionKind.NotModeled: {
            return (
                <p className="text-sm text-muted-foreground">
                    Risk candidates are not modeled for this account.
                </p>
            );
        }
        case ValueSectionKind.Ready: {
            return <RiskCandidatesTable view={candidates.view} />;
        }
    }
}

export function ValuesNotice({
    children,
    isLive,
    runNote = null,
    values,
}: {
    readonly children: ReactNode;
    readonly isLive: boolean;
    readonly runNote?: null | string;
    readonly values: AdviceValuesState;
}) {
    if (isLive) {
        return (
            <p className="text-sm text-muted-foreground">{NO_LIVE_VALUE_TEXT}</p>
        );
    }
    switch (values.phase) {
        case AdviceValuesPhase.Failed: {
            return (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                        Left out: {values.reason}
                    </p>
                    <Button
                        className="self-start"
                        onClick={values.retry}
                        variant="outline"
                    >
                        Retry the value views
                    </Button>
                </div>
            );
        }
        case AdviceValuesPhase.Idle: {
            return (
                <p className="text-sm text-muted-foreground">
                    The value views are unavailable for this account state.
                </p>
            );
        }
        case AdviceValuesPhase.Loading: {
            return (
                <div aria-busy="true" aria-label="Computing the value views">
                    <Skeleton className="h-16 w-full" />
                </div>
            );
        }
        case AdviceValuesPhase.Ready: {
            return (
                <div className="flex flex-col gap-2">
                    {children}
                    {runNote !== null && (
                        <p className="text-xs text-muted-foreground">{runNote}</p>
                    )}
                </div>
            );
        }
        case AdviceValuesPhase.Unavailable: {
            return (
                <p className="text-sm text-muted-foreground">
                    Left out: {values.reason}
                </p>
            );
        }
    }
}
