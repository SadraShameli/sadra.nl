'use client';

import { Check, ChevronDown, History, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type {
    Answers,
    AssessmentResult,
    TradeAssessmentRow,
    TradingPlanRow,
} from '~/lib/trading/types';

import Eyebrow from '~/components/Eyebrow';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Separator } from '~/components/ui/Separator';
import { profileTabs, routes, withQuery } from '~/lib/site/routes';
import {
    deleteAllAssessments,
    deleteAssessment,
    setActiveTradingPlan,
} from '~/lib/trading/actions';
import { cn } from '~/lib/utilities';

import { AnalysisReport } from './AnalysisReport';
import { HistoryStrip } from './HistoryStrip';
import { WizardStepper } from './WizardStepper';

type SubmissionState =
    | {
          answers: Answers;
          result: AssessmentResult;
          savedId: null | string;
          status: 'graded';
      }
    | { status: 'editing' };

export function ChecklistShell({
    activePlan,
    history,
    plans,
}: {
    activePlan: TradingPlanRow;
    history: TradeAssessmentRow[];
    plans: TradingPlanRow[];
}) {
    const router = useRouter();
    const [submission, setSubmission] = useState<SubmissionState>({
        status: 'editing',
    });
    const [isDeletePending, startDelete] = useTransition();

    const handleSelect = (row: TradeAssessmentRow) => {
        setSubmission({
            answers: row.answers,
            result: row.result,
            savedId: row.id,
            status: 'graded',
        });
    };

    const handleDelete = (id: string) => {
        startDelete(async () => {
            await deleteAssessment({ id });
            if (submission.status === 'graded' && submission.savedId === id) {
                setSubmission({ status: 'editing' });
            }
            router.refresh();
        });
    };

    const handleClearAll = () => {
        startDelete(async () => {
            await deleteAllAssessments();
            if (submission.status === 'graded') {
                setSubmission({ status: 'editing' });
            }
            router.refresh();
        });
    };

    return (
        <div
            className={cn(
                'app-trade-checklist__hub',
                'grid gap-6 lg:grid-cols-[1fr_320px]',
            )}
        >
            <div className="flex flex-col gap-6">
                <PlanHeader activePlan={activePlan} plans={plans} />

                {submission.status === 'editing' ? (
                    <WizardStepper
                        key={activePlan.id}
                        onSubmit={(answers, result) =>
                            setSubmission({
                                answers,
                                result,
                                savedId: null,
                                status: 'graded',
                            })
                        }
                        plan={activePlan}
                    />
                ) : (
                    <AnalysisReport
                        answers={submission.answers}
                        history={history}
                        onRestart={() => setSubmission({ status: 'editing' })}
                        onSaved={(id) => {
                            setSubmission((s) =>
                                s.status === 'graded'
                                    ? { ...s, savedId: id }
                                    : s,
                            );
                            router.refresh();
                        }}
                        plan={activePlan}
                        result={submission.result}
                        savedId={submission.savedId}
                    />
                )}
            </div>

            <aside
                className={cn(
                    'app-trade-checklist__history-aside',
                    'flex flex-col gap-4',
                )}
            >
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <History className="size-4" />
                            Recent
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{history.length}</Badge>
                            {history.length > 0 && (
                                <Button
                                    className="size-7"
                                    disabled={isDeletePending}
                                    onClick={handleClearAll}
                                    size="icon"
                                    variant="ghost"
                                >
                                    <Trash2 className="size-3.5 text-muted-foreground" />
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="p-0">
                        <ScrollArea className="h-115">
                            <HistoryStrip
                                history={history}
                                onDelete={handleDelete}
                                onSelect={handleSelect}
                            />
                        </ScrollArea>
                    </CardContent>
                </Card>
            </aside>
        </div>
    );
}

function PlanHeader({
    activePlan,
    plans,
}: {
    activePlan: TradingPlanRow;
    plans: TradingPlanRow[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const switchPlan = (planId: string) => {
        if (planId === activePlan.id) return;
        startTransition(async () => {
            await setActiveTradingPlan({ planId });
            router.refresh();
        });
    };

    return (
        <Card className="bg-black">
            <CardContent className="flex justify-between">
                <div>
                    <Eyebrow as="p">Active plan</Eyebrow>
                    <p className="mt-0.5 text-lg font-semibold text-white">
                        {activePlan.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                        <Link
                            href={withQuery(routes.profile, {
                                tab: profileTabs.tradingPlan,
                            })}
                        >
                            <Pencil className="size-3.5" />
                            Edit plan
                        </Link>
                    </Button>
                    {plans.length > 1 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    disabled={pending}
                                    size="sm"
                                    variant="outline"
                                >
                                    Switch plan
                                    <ChevronDown className="ml-1 size-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-2">
                                <div className="flex flex-col gap-1">
                                    {plans.map((p) => (
                                        <Button
                                            className={cn(
                                                'app-trade-checklist__plan-switch-item',
                                                'h-auto w-full justify-between px-3 py-2 text-left text-sm font-normal',
                                            )}
                                            data-state={
                                                p.id === activePlan.id
                                                    ? 'active'
                                                    : 'inactive'
                                            }
                                            key={p.id}
                                            onClick={() => switchPlan(p.id)}
                                            type="button"
                                            variant="ghost"
                                        >
                                            <span>{p.name}</span>
                                            {p.id === activePlan.id && (
                                                <Check className="size-4" />
                                            )}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
