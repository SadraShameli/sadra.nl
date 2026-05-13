'use client';

import { Check, ChevronDown, History, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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
import {
    deleteAllAssessments,
    deleteAssessment,
    setActiveTradingPlan,
} from '~/lib/trading-actions';
import type {
    Answers,
    AssessmentResult,
    TradeAssessmentRow,
    TradingPlanRow,
} from '~/lib/trading-types';
import { AnalysisReport } from './AnalysisReport';
import { HistoryStrip } from './HistoryStrip';
import { WizardStepper } from './WizardStepper';

type SubmissionState =
    | { status: 'editing' }
    | {
          status: 'graded';
          answers: Answers;
          result: AssessmentResult;
          savedId: string | null;
      };

export function ChecklistShell({
    activePlan,
    plans,
    history,
}: {
    activePlan: TradingPlanRow;
    plans: TradingPlanRow[];
    history: TradeAssessmentRow[];
}) {
    const router = useRouter();
    const [submission, setSubmission] = useState<SubmissionState>({
        status: 'editing',
    });
    const [deletePending, startDelete] = useTransition();

    const handleSelect = (row: TradeAssessmentRow) => {
        setSubmission({
            status: 'graded',
            answers: row.answers,
            result: row.result,
            savedId: row.id,
        });
    };

    const handleDelete = (id: string) => {
        startDelete(async () => {
            await deleteAssessment(id);
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
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
                <PlanHeader activePlan={activePlan} plans={plans} />

                {submission.status === 'editing' ? (
                    <WizardStepper
                        key={activePlan.id}
                        plan={activePlan}
                        onSubmit={(answers, result) =>
                            setSubmission({
                                status: 'graded',
                                answers,
                                result,
                                savedId: null,
                            })
                        }
                    />
                ) : (
                    <AnalysisReport
                        plan={activePlan}
                        answers={submission.answers}
                        result={submission.result}
                        history={history}
                        savedId={submission.savedId}
                        onSaved={(id) => {
                            setSubmission((s) =>
                                s.status === 'graded'
                                    ? { ...s, savedId: id }
                                    : s,
                            );
                            router.refresh();
                        }}
                        onRestart={() => setSubmission({ status: 'editing' })}
                    />
                )}
            </div>

            <aside className="space-y-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <History className="size-4" />
                            Recent
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{history.length}</Badge>
                            {history.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    disabled={deletePending}
                                    onClick={handleClearAll}
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
                                onSelect={handleSelect}
                                onDelete={handleDelete}
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
            await setActiveTradingPlan(planId);
            router.refresh();
        });
    };

    return (
        <Card className="bg-black">
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        Active plan
                    </p>
                    <p className="mt-0.5 text-lg font-semibold text-white">
                        {activePlan.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                        <Link href="/profile?tab=trading-plan">
                            <Pencil className="size-3.5" />
                            Edit plan
                        </Link>
                    </Button>
                    {plans.length > 1 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pending}
                                >
                                    Switch plan
                                    <ChevronDown className="ml-1 size-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-2">
                                <div className="space-y-1">
                                    {plans.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => switchPlan(p.id)}
                                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                                        >
                                            <span>{p.name}</span>
                                            {p.id === activePlan.id && (
                                                <Check className="size-4 text-emerald-400" />
                                            )}
                                        </button>
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
