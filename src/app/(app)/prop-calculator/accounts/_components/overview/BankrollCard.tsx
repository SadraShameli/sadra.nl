'use client';

import { memo, type ReactNode, useState } from 'react';

import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { ScaleAtMultipleKind } from '~/lib/prop-accounts/bankroll';

import {
    type BankrollCardModel,
    BankrollLossRiskKind,
    enteredMonthlyBudgetCentsOf,
    scaleModelAtBudget,
} from './overviewModel';
import { InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import { SampleBadge } from './SampleBadge';

const CANDIDATE_BUDGET_LABEL = 'Candidate monthly budget (dollars)';

export const BankrollCard = memo(function BankrollCard({
    model,
}: {
    readonly model: BankrollCardModel;
}) {
    return (
        <OverviewPanel
            info={bankrollInfoOf(model)}
            section={OverviewSectionId.Bankroll}
        >
            <StatStrip
                items={[
                    {
                        id: 'available',
                        label: 'Available bankroll',
                        value: model.available,
                    },
                    {
                        id: 'deposits',
                        label: 'Injected capital',
                        value: model.deposits,
                    },
                    {
                        id: 'reinvested-payouts',
                        label: 'Reinvested payouts',
                        value: model.reinvestedPayouts,
                    },
                    {
                        id: 'withdrawals',
                        label: 'Withdrawals',
                        value: model.withdrawals,
                    },
                ]}
            />
            {model.grownFromText !== null && (
                <p className="text-sm">{model.grownFromText}</p>
            )}
            <p className="text-sm text-muted-foreground">
                Money-weighted return: {model.moneyWeightedReturn}
            </p>
            <LossRiskBlock lossRisk={model.lossRisk} />
            <ScaleAtMultipleLine
                initial={model.scale}
                inputs={model.scaleInputs}
            />
        </OverviewPanel>
    );
});

function bankrollInfoOf(model: BankrollCardModel): ReactNode {
    const { lossRisk } = model;
    const sampleNote =
        lossRisk.kind === BankrollLossRiskKind.Unavailable
            ? null
            : lossRisk.sampleNote;
    if (sampleNote === null && model.undatedPaidPayoutsCaveat === null) {
        return undefined;
    }
    return (
        <InfoStack>
            {sampleNote !== null && <p>{sampleNote}</p>}
            {model.undatedPaidPayoutsCaveat !== null && (
                <p>{model.undatedPaidPayoutsCaveat}</p>
            )}
        </InfoStack>
    );
}

function LossRiskBlock({
    lossRisk,
}: {
    readonly lossRisk: BankrollCardModel['lossRisk'];
}) {
    if (lossRisk.kind === BankrollLossRiskKind.Unavailable) {
        return (
            <p className="text-sm text-muted-foreground">{lossRisk.reason}</p>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>Realized loss risk</PanelSubheading>
            <StatStrip
                items={[
                    {
                        id: 'attempt-pays',
                        label: 'Realized P(an attempt pays)',
                        value: lossRisk.attemptPays,
                    },
                    {
                        id: 'batch-loss',
                        label:
                            lossRisk.attemptsAtBankroll === null
                                ? 'Realized P(net below zero)'
                                : `Realized P(net below zero) at ${lossRisk.attemptsAtBankroll}`,
                        value: lossRisk.batchLoss,
                    },
                    {
                        id: 'no-payout',
                        label: 'Realized P(no payout)',
                        value: lossRisk.noPayout,
                    },
                    {
                        id: 'minimum-budget',
                        label: 'Realized minimum budget',
                        value: lossRisk.minimumBudget,
                    },
                ]}
            />
            {lossRisk.minimumBudgetNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {lossRisk.minimumBudgetNote}
                </p>
            )}
        </div>
    );
}

function ScaleAtMultipleLine({
    initial,
    inputs,
}: {
    readonly initial: BankrollCardModel['scale'];
    readonly inputs: BankrollCardModel['scaleInputs'];
}) {
    const [text, setText] = useState('');
    const canEnterBudget = inputs.cohortMultiple?.value != null;
    const scale = canEnterBudget
        ? scaleModelAtBudget(inputs, enteredMonthlyBudgetCentsOf(text))
        : initial;
    return (
        <div className="flex flex-col gap-2">
            {canEnterBudget && (
                <Field className="max-w-xs">
                    <FieldLabel htmlFor="prop-overview-candidate-budget">
                        {CANDIDATE_BUDGET_LABEL}
                    </FieldLabel>
                    <Input
                        aria-label={CANDIDATE_BUDGET_LABEL}
                        id="prop-overview-candidate-budget"
                        inputMode="decimal"
                        onChange={(event) => {
                            setText(event.target.value);
                        }}
                        placeholder="Optional"
                        value={text}
                    />
                </Field>
            )}
            <ScaleLine scale={scale} />
        </div>
    );
}

function ScaleLine({ scale }: { readonly scale: BankrollCardModel['scale'] }) {
    if (scale.kind === ScaleAtMultipleKind.Unavailable) {
        return <p className="text-sm text-muted-foreground">{scale.reason}</p>;
    }
    return (
        <div className="flex flex-col gap-1">
            <p className="text-sm">
                Scale at your measured multiple: {scale.multiple} (95% band{' '}
                {scale.intervalLower} to {scale.intervalUpper}, n = {scale.n}){' '}
                <SampleBadge level={scale.sampleLevel} />{' '}
                {scale.projectionLabel} {scale.projected} on a budget of{' '}
                {scale.budget}.
            </p>
            <p className="text-xs text-muted-foreground">
                Budget basis: {scale.budgetLabel}.
            </p>
            {scale.cappedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {scale.cappedNote}
                </p>
            )}
        </div>
    );
}
