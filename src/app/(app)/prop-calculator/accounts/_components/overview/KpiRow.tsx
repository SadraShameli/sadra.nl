import {
    isMissingFigure,
    isPendingFigure,
} from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { MissingValue } from '~/components/MissingValue';
import { StatStrip } from '~/components/StatStrip';

import { KpiState, type OverviewKpi } from './overviewModel';

export function KpiRow({ kpis }: { readonly kpis: readonly OverviewKpi[] }) {
    return (
        <StatStrip
            items={kpis
                .filter(
                    (kpi) =>
                        kpi.state === KpiState.Failed ||
                        !isMissingFigure(kpi.value),
                )
                .map((kpi) => {
                    const isFailed = kpi.state === KpiState.Failed;
                    const isLoading = isPendingFigure(kpi.value);
                    return {
                        caption:
                            isLoading || isFailed
                                ? undefined
                                : (kpi.detail ?? undefined),
                        id: kpi.kind,
                        info: kpi.note ?? undefined,
                        isLoading,
                        label: kpi.label,
                        value: isFailed ? (
                            <MissingValue
                                reason={
                                    kpi.detail === null
                                        ? undefined
                                        : sentenceOf(kpi.detail)
                                }
                            />
                        ) : (
                            kpi.value
                        ),
                    };
                })}
        />
    );
}
