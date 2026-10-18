import { CalendarRange } from 'lucide-react';
import { memo } from 'react';

import { hasFigure } from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { NOT_APPLICABLE } from '~/lib/format';

import { type RepeatabilityCardModel } from './overviewModel';
import { InfoStack, OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

type RepeatabilityStatsRow = NonNullable<RepeatabilityCardModel['overall']>;

export const RepeatabilityCard = memo(function RepeatabilityCard({
    model,
}: {
    readonly model: RepeatabilityCardModel;
}) {
    if (model.overall === null && model.perSlot === null) {
        return (
            <OverviewEmptyPanel
                icon={CalendarRange}
                section={OverviewSectionId.Repeatability}
                title="No complete month yet"
            />
        );
    }
    return (
        <OverviewPanel
            info={
                <InfoStack>
                    <p>{model.basisNote}</p>
                    {model.perSlotTargetNote !== null && (
                        <p>{model.perSlotTargetNote}</p>
                    )}
                </InfoStack>
            }
            section={OverviewSectionId.Repeatability}
        >
            <div className="grid gap-6 md:grid-cols-2">
                <RepeatabilityGroup
                    label="Across every complete month"
                    stats={model.overall}
                />
                <RepeatabilityGroup
                    label="Per funded slot per month (measured accounts only)"
                    stats={model.perSlot}
                />
            </div>
        </OverviewPanel>
    );
});

function RepeatabilityGroup({
    label,
    stats,
}: {
    readonly label: string;
    readonly stats: null | RepeatabilityStatsRow;
}) {
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>{label}</PanelSubheading>
            {stats === null ? (
                <EmptyState
                    icon={CalendarRange}
                    size={EmptyStateSize.Compact}
                    title="No complete month yet"
                />
            ) : (
                <StatStrip
                    items={[
                        { id: 'months', label: 'Months', value: stats.count },
                        {
                            id: 'mean',
                            label: 'Mean (net per month)',
                            value: stats.mean,
                        },
                        {
                            id: 'standard-deviation',
                            label: 'Standard deviation (net per month)',
                            value: stats.standardDeviation,
                        },
                        {
                            id: 'worst',
                            label: 'Worst (net per month)',
                            value: stats.worst,
                        },
                        {
                            id: 'best',
                            label: 'Best (net per month)',
                            value: stats.best,
                        },
                        {
                            id: 'share-positive',
                            label: 'Share positive (net per month)',
                            value: stats.sharePositive,
                        },
                        {
                            id: 'share-at-or-above-target',
                            label: 'Share at or above target (payouts per month)',
                            value: stats.shareAtOrAboveTarget ?? NOT_APPLICABLE,
                        },
                    ].filter((item) => hasFigure(item.value))}
                />
            )}
        </div>
    );
}
