'use client';

import { useMemo, useState } from 'react';

import type { LightAssessment } from '~/lib/trading/analytics';

import { FilterToolbar } from '~/components/FilterToolbar';
import { ToolPanel } from '~/components/ToolPanel';
import { Card, CardContent } from '~/components/ui/card';
import { FilterSelect } from '~/components/ui/filter-select';
import { cn } from '~/lib/utilities';

import { ComponentCorrelationChart } from './analytics/ComponentCorrelationChart';
import { CumulativeRChart } from './analytics/CumulativeRChart';
import { ExecutionImpactPanel } from './analytics/ExecutionImpactPanel';
import { GradeCalibrationChart } from './analytics/GradeCalibrationChart';
import { KpiStrip } from './analytics/KpiStrip';
import { OutcomeDonut } from './analytics/OutcomeDonut';
import { PerWindowChart } from './analytics/PerWindowChart';
import { WinRateByGradeChart } from './analytics/WinRateByGradeChart';

interface AnalyticsDashboardProperties {
    assessments: LightAssessment[];
    plans: { id: string; name: string }[];
}

const ALL_PLANS = 'all';

export function AnalyticsDashboard({
    assessments,
    plans,
}: AnalyticsDashboardProperties) {
    const [planFilter, setPlanFilter] = useState<string>(ALL_PLANS);

    const filtered = useMemo(() => {
        return planFilter === ALL_PLANS
            ? assessments
            : assessments.filter((a) => a.planId === planFilter);
    }, [assessments, planFilter]);

    return assessments.length === 0 ? (
        <Card>
            <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                    No graded assessments yet. Run the checklist and record
                    outcomes to see analytics here.
                </p>
            </CardContent>
        </Card>
    ) : (
        <div
            className={cn(
                'app-trade-checklist__analytics-dashboard',
                'flex flex-col gap-6',
            )}
        >
            {plans.length > 1 && (
                <FilterToolbar label="Analytics filters">
                    <FilterSelect
                        label="Plan"
                        onValueChange={(v) => setPlanFilter(v ?? ALL_PLANS)}
                        options={plans.map((p) => ({
                            label: p.name,
                            value: p.id,
                        }))}
                        placeholder="All plans"
                        value={
                            planFilter === ALL_PLANS ? undefined : planFilter
                        }
                    />
                </FilterToolbar>
            )}

            <KpiStrip assessments={filtered} />

            <div className="grid gap-6 lg:grid-cols-2">
                <ToolPanel title="Cumulative R over time">
                    <CumulativeRChart assessments={filtered} />
                </ToolPanel>

                <ToolPanel title="Outcome distribution">
                    <OutcomeDonut assessments={filtered} />
                </ToolPanel>
            </div>

            <ToolPanel title="Win rate by grade">
                <WinRateByGradeChart assessments={filtered} />
            </ToolPanel>

            <ToolPanel title="Grade calibration (avg outcome R per grade)">
                <GradeCalibrationChart assessments={filtered} />
            </ToolPanel>

            <ToolPanel title="Performance by macro window">
                <PerWindowChart assessments={filtered} />
            </ToolPanel>

            <ToolPanel
                info="Bucketed by % of component max earned. Higher buckets should produce higher avg R if the section has edge."
                title="Component score correlation"
            >
                <ComponentCorrelationChart assessments={filtered} />
            </ToolPanel>

            <ToolPanel title="Execution impact">
                <ExecutionImpactPanel assessments={filtered} />
            </ToolPanel>
        </div>
    );
}
