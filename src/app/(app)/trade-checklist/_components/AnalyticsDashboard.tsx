'use client';

import { useMemo, useState } from 'react';

import type { LightAssessment } from '~/lib/trading/analytics';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { FilterSelect } from '~/components/ui/filter-select';
import { cn } from '~/lib/utilities';

import { ComponentCorrelationChart } from './analytics/ComponentCorrelationChart';
import { CumulativeRChart } from './analytics/CumulativeRChart';
import { ExecutionImpactPanel } from './analytics/ExecutionImpactPanel';
import { GradeCalibrationChart } from './analytics/GradeCalibrationChart';
import { KpiTiles } from './analytics/KpiTiles';
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
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
            )}

            <KpiTiles assessments={filtered} />

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Cumulative R over time
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CumulativeRChart assessments={filtered} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Outcome distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <OutcomeDonut assessments={filtered} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Win rate by grade
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <WinRateByGradeChart assessments={filtered} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Grade calibration (avg outcome R per grade)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <GradeCalibrationChart assessments={filtered} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Performance by macro window
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <PerWindowChart assessments={filtered} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Component score correlation
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ComponentCorrelationChart assessments={filtered} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Execution impact
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ExecutionImpactPanel assessments={filtered} />
                </CardContent>
            </Card>
        </div>
    );
}
