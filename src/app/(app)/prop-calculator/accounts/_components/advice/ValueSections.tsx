'use client';

import { type ReactNode } from 'react';

import { InfoNote } from '~/components/InfoNote';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';

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
            <InfoNote>
                No trade is placeable today, so there is no next trade to value.
            </InfoNote>
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
                <InfoNote
                    info={valueView.boundaryNote}
                    infoTitle="Valuation assumption"
                >
                    Valuation assumption
                </InfoNote>
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
        return <InfoNote>No risk candidates were computed.</InfoNote>;
    }
    switch (candidates.kind) {
        case ValueSectionKind.Failed: {
            return <InfoNote>Left out: {candidates.reason}</InfoNote>;
        }
        case ValueSectionKind.NotModeled: {
            return (
                <InfoNote>
                    Risk candidates are not modeled for this account.
                </InfoNote>
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
        return <InfoNote>{NO_LIVE_VALUE_TEXT}</InfoNote>;
    }
    switch (values.phase) {
        case AdviceValuesPhase.Failed: {
            return (
                <div className="flex flex-col gap-2">
                    <InfoNote>Left out: {values.reason}</InfoNote>
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
                <InfoNote>
                    The value views are unavailable for this account state.
                </InfoNote>
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
                        <InfoNote info={runNote} infoTitle="Run settings">
                            Run settings and assumptions
                        </InfoNote>
                    )}
                </div>
            );
        }
        case AdviceValuesPhase.Unavailable: {
            return <InfoNote>Left out: {values.reason}</InfoNote>;
        }
    }
}
