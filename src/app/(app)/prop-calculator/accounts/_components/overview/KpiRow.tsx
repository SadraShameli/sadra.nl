import {
    isMissingFigure,
    isPendingFigure,
} from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { StatStrip, StatTone } from '~/components/StatStrip';

import { KpiTone, type OverviewKpi } from './overviewModel';

const STAT_TONE: Readonly<Record<KpiTone, StatTone>> = {
    [KpiTone.Negative]: StatTone.Negative,
    [KpiTone.Neutral]: StatTone.Default,
    [KpiTone.Pending]: StatTone.Muted,
    [KpiTone.Positive]: StatTone.Positive,
};

export function KpiRow({ kpis }: { readonly kpis: readonly OverviewKpi[] }) {
    return (
        <StatStrip
            items={kpis
                .filter((kpi) => !isMissingFigure(kpi.value))
                .map((kpi) => {
                    const isLoading = isPendingFigure(kpi.value);
                    return {
                        caption: isLoading
                            ? undefined
                            : (kpi.detail ?? undefined),
                        id: kpi.kind,
                        info: kpi.note ?? undefined,
                        isLoading,
                        label: kpi.label,
                        tone: STAT_TONE[kpi.tone],
                        value: kpi.value,
                    };
                })}
        />
    );
}
