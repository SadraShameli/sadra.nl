import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';

import { KpiTone, type OverviewKpi } from './overviewModel';

export function KpiRow({ kpis }: { readonly kpis: readonly OverviewKpi[] }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {kpis.map((kpi) => (
                <StatCard
                    key={kpi.kind}
                    label={kpi.label}
                    sub={subOf(kpi)}
                    value={kpi.value}
                    valueClassName={toneClassName(kpi.tone)}
                />
            ))}
        </div>
    );
}

function subOf(kpi: OverviewKpi): string | undefined {
    const parts = [kpi.detail, kpi.note].filter(
        (part): part is string => part !== null,
    );
    return parts.length === 0 ? undefined : parts.join('; ');
}

function toneClassName(tone: KpiTone): string | undefined {
    switch (tone) {
        case KpiTone.Negative: {
            return 'text-red-400';
        }
        case KpiTone.Neutral: {
            return undefined;
        }
        case KpiTone.Pending: {
            return 'text-muted-foreground';
        }
        case KpiTone.Positive: {
            return 'text-emerald-400';
        }
    }
}
