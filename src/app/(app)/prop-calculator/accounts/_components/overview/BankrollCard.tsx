'use client';

import { memo, useState } from 'react';

import { FigureCard } from '~/app/(app)/prop-calculator/accounts/_components/FigureCard';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { ScaleAtMultipleKind } from '~/lib/prop-accounts/bankroll';

import {
    type BankrollCardModel,
    BankrollLossRiskKind,
    enteredMonthlyBudgetCentsOf,
    scaleModelAtBudget,
} from './overviewModel';
import { SampleBadge } from './SampleBadge';

const CANDIDATE_BUDGET_LABEL = 'Candidate monthly budget (dollars)';

export const BankrollCard = memo(function BankrollCard({
    model,
}: {
    readonly model: BankrollCardModel;
}) {
    return (
        <div className="flex flex-col gap-4">
            <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <FigureCard
                    label="Available bankroll"
                    value={model.available}
                />
                <FigureCard label="Injected capital" value={model.deposits} />
                <FigureCard
                    label="Reinvested payouts"
                    value={model.reinvestedPayouts}
                />
                <FigureCard label="Withdrawals" value={model.withdrawals} />
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
});

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
            <h3 className="text-sm font-medium text-foreground">
                Realized loss risk
            </h3>
            <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <FigureCard
                    label="Realized P(an attempt pays)"
                    value={lossRisk.attemptPays}
                />
                <FigureCard
                    label={
                        lossRisk.attemptsAtBankroll === null
                            ? 'Realized P(net below zero)'
                            : `Realized P(net below zero) at ${lossRisk.attemptsAtBankroll}`
                    }
                    value={lossRisk.batchLoss}
                />
                <FigureCard
                    label="Realized P(no payout)"
                    value={lossRisk.noPayout}
                />
                <FigureCard
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
