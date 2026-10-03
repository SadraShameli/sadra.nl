import { ScaleAtMultipleKind } from '~/lib/prop-accounts/bankroll';

import { type BankrollCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

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
            <ScaleAtMultipleLine scale={model.scale} />
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

function ScaleAtMultipleLine({
    scale,
}: {
    readonly scale: BankrollCardModel['scale'];
}) {
    if (scale.kind === ScaleAtMultipleKind.Unavailable) {
        return <p className="text-sm text-muted-foreground">{scale.reason}</p>;
    }
    return (
        <div className="flex flex-col gap-1">
            <p className="text-sm">
                Scale at your measured multiple: {scale.multiple} (95% band{' '}
                {scale.intervalLower} to {scale.intervalUpper}, n = {scale.n}){' '}
                <SampleBadge level={scale.sampleLevel} /> {scale.projectionLabel}{' '}
                {scale.projected} on a budget of {scale.budget}.
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
