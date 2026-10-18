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
            items={kpis.map((kpi) => ({
                caption: kpi.detail ?? undefined,
                id: kpi.kind,
                info: kpi.note ?? undefined,
                label: kpi.label,
                tone: STAT_TONE[kpi.tone],
                value: kpi.value,
            }))}
        />
    );
}
