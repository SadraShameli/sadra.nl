'use client';

import { useState } from 'react';

import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { ScaleAtMultipleKind } from '~/lib/prop-accounts/bankroll';

import {
    type BankrollCardModel,
    BankrollLossRiskKind,
    enteredMonthlyBudgetCentsOf,
    scaleModelAtBudget,
} from './overviewModel';
import { SampleBadge } from './SampleBadge';

const CANDIDATE_BUDGET_LABEL = 'Candidate monthly budget (dollars)';

export function BankrollCard({ model }: { readonly model: BankrollCardModel }) {
    return (
        <div className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <BankrollFigure
                    label="Available bankroll"
                    value={model.available}
                />
                <BankrollFigure
                    label="Injected capital"
                    value={model.deposits}
                />
                <BankrollFigure
                    label="Reinvested payouts"
                    value={model.reinvestedPayouts}
                />
                <BankrollFigure label="Withdrawals" value={model.withdrawals} />
            </dl>
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
            {model.undatedPaidPayoutsCaveat !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.undatedPaidPayoutsCaveat}
                </p>
            )}
        </div>
    );
}

function BankrollFigure({
    label,
    value,
}: {
    readonly label: string;
    readonly value: string;
}) {
    return (
        <div className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
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
            <h3 className="text-sm font-medium text-white">
                Realized loss risk
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <BankrollFigure
                    label="Realized P(an attempt pays)"
                    value={lossRisk.attemptPays}
                />
                <BankrollFigure
                    label={`Realized P(net below zero) at ${lossRisk.attemptsAtBankroll} attempts`}
                    value={lossRisk.batchLoss}
                />
                <BankrollFigure
                    label="Realized P(no payout)"
                    value={lossRisk.noPayout}
                />
                <BankrollFigure
                    label="Realized minimum budget"
                    value={lossRisk.minimumBudget}
                />
            </dl>
            {lossRisk.minimumBudgetNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {lossRisk.minimumBudgetNote}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                {lossRisk.sampleNote}
            </p>
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
                <div className="flex max-w-xs flex-col gap-1">
                    <Label htmlFor="prop-overview-candidate-budget">
                        {CANDIDATE_BUDGET_LABEL}
                    </Label>
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
                </div>
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
