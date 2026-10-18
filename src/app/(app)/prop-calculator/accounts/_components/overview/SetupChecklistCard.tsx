import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';

import { PanelSubheading } from '~/components/PanelSubheading';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { SetupStepStatus } from '~/lib/prop-accounts';
import { cn } from '~/lib/utilities';

import { type SetupChecklistCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import { SetupAccountsTable } from './SetupAccountsTable';

type SetupStepModel = SetupChecklistCardModel['steps'][number];

const COUNTING_TEXT = 'Counting the steps done';

export const SetupChecklistCard = memo(function SetupChecklistCard({
    model,
}: {
    readonly model: SetupChecklistCardModel;
}) {
    return (
        <OverviewPanel section={OverviewSectionId.Setup}>
            <SetupProgress model={model} />
            <SetupStepList steps={model.steps} />
        </OverviewPanel>
    );
});

export function SetupChecklistCompact({
    model,
}: {
    readonly model: SetupChecklistCardModel;
}) {
    return (
        <section
            aria-labelledby="setup-checklist-compact"
            className="flex flex-col gap-3"
        >
            <div className="flex items-baseline justify-between gap-3">
                <PanelSubheading id="setup-checklist-compact">
                    Finish the setup
                </PanelSubheading>
                <SetupCount model={model} />
            </div>
            <SetupBar model={model} />
            <SetupStepList steps={model.steps} />
        </section>
    );
}

function SetupBar({ model }: { readonly model: SetupChecklistCardModel }) {
    const percent =
        model.totalSteps === 0 ? 0 : (model.doneCount / model.totalSteps) * 100;
    return (
        <Progress
            aria-label="Setup progress"
            className="h-1.5"
            value={percent}
        />
    );
}

function SetupCount({ model }: { readonly model: SetupChecklistCardModel }) {
    return (
        <span className="text-xs text-muted-foreground tabular-nums">
            {String(model.doneCount)} of {String(model.totalSteps)} steps done
        </span>
    );
}

function SetupProgress({ model }: { readonly model: SetupChecklistCardModel }) {
    if (model.isCounting) {
        return (
            <div aria-busy="true" className="flex flex-col gap-2">
                <span className="sr-only" role="status">
                    {COUNTING_TEXT}
                </span>
                <Skeleton aria-hidden className="h-4 w-28" />
                <Skeleton aria-hidden className="h-1.5 w-full" />
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <SetupCount model={model} />
            <SetupBar model={model} />
        </div>
    );
}

function SetupStepItem({ step }: { readonly step: SetupStepModel }) {
    const isOpen =
        step.status === SetupStepStatus.Missing ||
        step.status === SetupStepStatus.NotChecked;
    return (
        <li className="flex flex-col gap-3 p-3">
            <div className="flex items-start gap-3">
                <StepIcon status={step.status} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p
                        className={cn(
                            'text-sm font-medium',
                            step.status === SetupStepStatus.Done
                                ? 'text-muted-foreground'
                                : 'text-foreground',
                        )}
                    >
                        <span className="sr-only">{step.statusLabel}: </span>
                        {step.label}
                    </p>
                    {step.detail !== null && (
                        <p className="text-xs text-muted-foreground">
                            {step.detail}
                        </p>
                    )}
                    {step.status === SetupStepStatus.NotApplicable && (
                        <p className="text-xs text-muted-foreground">
                            {step.statusLabel}
                        </p>
                    )}
                </div>
                {isOpen && (
                    <Button
                        asChild
                        className="shrink-0"
                        size="sm"
                        variant={
                            step.status === SetupStepStatus.Missing
                                ? 'outline'
                                : 'ghost'
                        }
                    >
                        <Link href={step.href}>{step.actionLabel}</Link>
                    </Button>
                )}
            </div>
            {step.accounts.length > 0 && (
                <SetupAccountsTable accounts={step.accounts} />
            )}
            {step.items.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pl-7">
                    {step.items.map((item) => (
                        <li key={item.key}>
                            <Badge
                                asChild
                                className="font-medium hover:bg-accent"
                            >
                                <Link href={item.href}>{item.label}</Link>
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

function SetupStepList({
    steps,
}: {
    readonly steps: readonly SetupStepModel[];
}) {
    return (
        <ul className="divide-y divide-border rounded-lg border border-border">
            {steps.map((step) => (
                <SetupStepItem key={step.key} step={step} />
            ))}
        </ul>
    );
}

function StepIcon({ status }: { readonly status: SetupStepStatus }) {
    const className = 'mt-0.5 size-4 shrink-0';
    switch (status) {
        case SetupStepStatus.Done: {
            return (
                <CircleCheck
                    aria-hidden
                    className={cn(className, 'text-success')}
                />
            );
        }
        case SetupStepStatus.Missing: {
            return (
                <CircleAlert
                    aria-hidden
                    className={cn(className, 'text-warning')}
                />
            );
        }
        case SetupStepStatus.NotApplicable:
        case SetupStepStatus.NotChecked: {
            return (
                <CircleDashed
                    aria-hidden
                    className={cn(className, 'text-muted-foreground')}
                />
            );
        }
    }
}
