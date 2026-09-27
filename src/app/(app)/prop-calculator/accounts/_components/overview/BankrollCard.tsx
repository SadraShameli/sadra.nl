import { type BankrollCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

export function BankrollCard({
    model,
}: {
    readonly model: BankrollCardModel;
}) {
    return (
        <div className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <BankrollFigure
                    label="Available bankroll"
                    value={model.availableCents}
                />
                <BankrollFigure
                    label="Grown from"
                    value={model.grownFromCents}
                />
                <BankrollFigure
                    label="Deposits"
                    value={model.depositsCents}
                />
                <BankrollFigure
                    label="Withdrawals"
                    value={model.withdrawalsCents}
                />
            </dl>
            <p className="text-sm text-muted-foreground">
                Money-weighted return: {model.moneyWeightedReturn}
            </p>
            <ScaleAtMultipleLine scale={model.scale} />
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
    if (scale.kind === 'unavailable') {
        return <p className="text-sm text-muted-foreground">{scale.reason}</p>;
    }
    return (
        <p className="text-sm">
            Scale at your measured multiple: {scale.multiple} (95% band{' '}
            {scale.intervalLower} to {scale.intervalUpper}, n = {scale.n}){' '}
            <SampleBadge level={scale.sampleLevel} /> projects to{' '}
            {scale.projectedMonthlyCents} at your candidate monthly budget.
        </p>
    );
}
