import { NOT_APPLICABLE } from '~/lib/format';

import { type RepeatabilityCardModel } from './overviewModel';

type RepeatabilityStatsRow = NonNullable<RepeatabilityCardModel['overall']>;

export function RepeatabilityCard({
    model,
}: {
    readonly model: RepeatabilityCardModel;
}) {
    if (model.overall === null && model.perSlot === null) {
        return (
            <p className="text-sm text-muted-foreground">
                No complete month yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-6 sm:grid-cols-2">
                <RepeatabilityGroup
                    label="Across every complete month"
                    stats={model.overall}
                />
                <RepeatabilityGroup
                    label="Per funded slot per month"
                    stats={model.perSlot}
                />
            </div>
            {model.perSlotTargetNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.perSlotTargetNote}
                </p>
            )}
        </div>
    );
}

function RepeatabilityGroup({
    label,
    stats,
}: {
    readonly label: string;
    readonly stats: null | RepeatabilityStatsRow;
}) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-white">{label}</h3>
            {stats === null ? (
                <p className="text-sm text-muted-foreground">
                    No complete month yet.
                </p>
            ) : (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                    <Stat label="Months" value={stats.count} />
                    <Stat label="Mean" value={stats.mean} />
                    <Stat
                        label="Standard deviation"
                        value={stats.standardDeviation}
                    />
                    <Stat label="Worst" value={stats.worst} />
                    <Stat label="Best" value={stats.best} />
                    <Stat
                        label="Share positive"
                        value={stats.sharePositive}
                    />
                    <Stat
                        label="Share at or above target"
                        value={stats.shareAtOrAboveTarget ?? NOT_APPLICABLE}
                    />
                </dl>
            )}
        </div>
    );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}
