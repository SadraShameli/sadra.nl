'use client';

import { useMemo, useState } from 'react';

import type { LightAssessment } from '~/lib/trading-analytics';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Select } from '~/components/ui/Select';
import { cn } from '~/lib/utils';

import { ComponentCorrelationChart } from './analytics/ComponentCorrelationChart';
import { CumulativeRChart } from './analytics/CumulativeRChart';
import { ExecutionImpactPanel } from './analytics/ExecutionImpactPanel';
import { GradeCalibrationChart } from './analytics/GradeCalibrationChart';
import { KpiTiles } from './analytics/KpiTiles';
import { OutcomeDonut } from './analytics/OutcomeDonut';
import { PerWindowChart } from './analytics/PerWindowChart';
import { WinRateByGradeChart } from './analytics/WinRateByGradeChart';

interface AnalyticsDashboardProps {
    assessments: LightAssessment[];
    plans: { id: string; name: string }[];
}

const ALL_PLANS = 'all';

export function AnalyticsDashboard({
    assessments,
    plans,
}: AnalyticsDashboardProps) {
    const [planFilter, setPlanFilter] = useState<string>(ALL_PLANS);

    const filtered = useMemo(() => {
        if (planFilter === ALL_PLANS) return assessments;
        return assessments.filter((a) => a.planId === planFilter);
    }, [assessments, planFilter]);

    if (assessments.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                        No graded assessments yet. Run the checklist and record
                        outcomes to see analytics here.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div
            className={cn(
                'app-trade-checklist__analytics-dashboard',
                'space-y-6',
            )}
        >
            {plans.length > 1 && (
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs tracking-wider text-muted-foreground uppercase">
                        Filter plan
                    </span>
                    <Select
                        className="w-64"
                        onChange={(e) => setPlanFilter(e.target.value)}
                        value={planFilter}
                    >
                        <option value={ALL_PLANS}>All plans</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </Select>
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
