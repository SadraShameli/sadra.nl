'use client';

import { UserPlus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';

import { CalculatorInputsForm } from '~/app/(app)/prop-calculator/_components/CalculatorInputsForm';
import {
    useBaseResult,
    useCalculatorActions,
    useCalculatorInputs,
    useLabSlots,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { kpiDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import {
    PanelSkeleton,
    PanelSkeletonSize,
} from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import PercentileBar from '~/app/(app)/prop-calculator/_components/PercentileBar';
import { currentBaseFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { FundedValueCard } from '~/app/(app)/prop-calculator/_components/value/FundedValueCard';
import { valueCardsInputFor } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { ValueChainCard } from '~/app/(app)/prop-calculator/_components/value/ValueChainCard';
import { accountPrefillHref } from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import { Button } from '~/components/ui/Button';
import { useSession } from '~/lib/auth/client';
import { formatCompactCurrency, formatDays } from '~/lib/format';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { api } from '~/trpc/react';

const ResultsPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/ResultsPanel'),
    { loading: () => <PanelSkeleton size={PanelSkeletonSize.Aside} /> },
);

const ChartPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/ChartPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function SimulatorView() {
    const { planOptIns, simInputs, state } = useCalculatorInputs();
    const { error, isPending, result } = useBaseResult();
    const failure = currentBaseFailure(simInputs, {
        error,
        isPending,
        result,
    });
    const failureNotice =
        failure === null ? null : <SimulationFailureNotice message={failure} />;
    const { chartType, pinned } = useLabSlots();
    const actions = useCalculatorActions();

    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const rulebook =
        hasSession && rulebookQuery.data !== undefined
            ? rulebookQuery.data
            : DEFAULT_RULEBOOK;
    const valueCards = useMemo(
        () => valueCardsInputFor(state, rulebook),
        [state, rulebook],
    );

    return (
        <>
            <ToolPageHeading toolId={ToolId.Simulator} />
            <div className="mb-10 flex flex-col gap-6">
                <ToolSection
                    className="gap-6"
                    id={LegacySection.Simulator}
                    title="Inputs and results"
                >
                    <CalculatorInputsForm
                        aside={
                            failureNotice ??
                            (result === null ? (
                                <PanelSkeleton size={PanelSkeletonSize.Aside} />
                            ) : (
                                <ResultsPanel
                                    fundedHorizonDays={state.fundedHorizonDays}
                                    isPending={isPending}
                                    onPin={() => actions.pinScenario(result)}
                                    onUnpin={actions.unpinScenario}
                                    pinned={pinned?.result ?? null}
                                    plan={state.plan}
                                    result={result}
                                />
                            ))
                        }
                    />
                    <Button
                        asChild
                        className="self-end"
                        size="sm"
                        variant="outline"
                    >
                        <Link
                            href={accountPrefillHref(
                                state.firm.id,
                                state.plan,
                                planOptIns,
                            )}
                            prefetch={false}
                        >
                            <UserPlus aria-hidden />
                            Save as account
                        </Link>
                    </Button>
                </ToolSection>

                <ToolSection
                    className="gap-3"
                    id={LegacySection.Charts}
                    title="Charts"
                >
                    {failureNotice ??
                        (result === null ? (
                            <>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <PanelSkeleton
                                        size={PanelSkeletonSize.Bar}
                                    />
                                    <PanelSkeleton
                                        size={PanelSkeletonSize.Bar}
                                    />
                                </div>
                                <PanelSkeleton />
                            </>
                        ) : (
                            <>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <PercentileBar
                                        description={
                                            kpiDescriptions.finalBalance
                                        }
                                        formatValue={formatCompactCurrency}
                                        label="Final balance distribution"
                                        p5={result.finalBalanceP5}
                                        p25={result.finalBalanceP25}
                                        p50={result.finalBalanceP50}
                                        p75={result.finalBalanceP75}
                                        p95={result.finalBalanceP95}
                                        referenceLine={{
                                            label: 'Starting balance',
                                            value: state.plan.accountSize,
                                        }}
                                    />
                                    <PercentileBar
                                        description={kpiDescriptions.daysToPass}
                                        formatValue={formatDays}
                                        label="Days to pass distribution"
                                        p5={result.daysToPassP5}
                                        p25={result.daysToPassP25}
                                        p50={result.daysToPassP50}
                                        p75={result.daysToPassP75}
                                        p95={result.daysToPassP95}
                                    />
                                </div>
                                <ChartPanel
                                    chartType={chartType}
                                    maxEvalDays={state.maxEvalDays}
                                    onChartTypeChange={actions.setChartType}
                                    result={result}
                                    totalTrials={state.trials}
                                />
                            </>
                        ))}
                </ToolSection>

                <section
                    aria-labelledby="value-heading"
                    className="flex scroll-mt-26 flex-col gap-6"
                    id="value"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id="value-heading"
                    >
                        Value
                    </h2>
                    <ValueChainCard cards={valueCards} />
                    <FundedValueCard
                        cards={valueCards}
                        rulebookSampleThreshold={rulebook.samples.minFundedAccounts}
                    />
                </section>
            </div>
        </>
    );
}
