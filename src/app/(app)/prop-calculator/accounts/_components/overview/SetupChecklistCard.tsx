import Link from 'next/link';

import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { SetupStep, SetupStepStatus } from '~/lib/prop-accounts';

import { type SetupChecklistCardModel } from './overviewModel';

type SetupStepModel = SetupChecklistCardModel['steps'][number];

const NOT_CHECKED_TEXT: Readonly<Record<SetupStep, string>> = {
    [SetupStep.BudgetSet]: 'Budget: checked on the overview',
    [SetupStep.CostsEntered]: 'Costs: checked on the overview',
    [SetupStep.ExpectedValueComputed]:
        'Expected value: checked on the overview',
    [SetupStep.FirmRulesVerified]: 'Firm rules: checked on the overview',
    [SetupStep.StagesCaptured]: 'Stages: checked on the overview',
};

export function SetupChecklistCard({
    model,
}: {
    readonly model: SetupChecklistCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
                {String(model.doneCount)} of {String(model.totalSteps)} steps
                done.
            </p>
            <ul className="flex flex-col gap-3">
                {model.steps.map((step) => (
                    <li className="flex flex-col gap-1" key={step.key}>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusVariant(step.status)}>
                                {step.statusLabel}
                            </Badge>
                            <Link
                                className="text-sm font-medium underline-offset-4 hover:underline"
                                href={step.href}
                            >
                                {step.label}
                            </Link>
                        </div>
                        <StepDetail step={step} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function SetupChecklistCompact({
    href,
    model,
}: {
    readonly href: string;
    readonly model: SetupChecklistCardModel;
}) {
    const hasUncheckedStep = model.steps.some(
        (step) => step.status === SetupStepStatus.NotChecked,
    );
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
                Setup: {String(model.doneCount)} of {String(model.totalSteps)}{' '}
                steps done.{' '}
                {hasUncheckedStep && (
                    <>
                        The count leaves out the steps checked on the
                        overview.{' '}
                    </>
                )}
                <Link className="underline underline-offset-4" href={href}>
                    Finish the setup
                </Link>
            </p>
            <ul className="flex flex-col gap-2">
                {model.steps.map((step) => (
                    <li className="flex flex-col gap-1" key={step.key}>
                        <CompactStepBadge step={step} />
                        <StepDetail step={step} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CompactStepBadge({ step }: { readonly step: SetupStepModel }) {
    const linkClassName =
        'underline-offset-4 hover:underline text-xs font-medium';
    if (step.status === SetupStepStatus.NotChecked) {
        return (
            <Badge variant={statusVariant(step.status)}>
                <Link className={linkClassName} href={step.href}>
                    {NOT_CHECKED_TEXT[step.key]}
                </Link>
            </Badge>
        );
    }
    return (
        <Badge variant={statusVariant(step.status)}>
            <Link className={linkClassName} href={step.href}>
                {step.label}
            </Link>
            : {step.statusLabel}
        </Badge>
    );
}

function statusVariant(status: SetupStepStatus): BadgeProperties['variant'] {
    switch (status) {
        case SetupStepStatus.Done: {
            return 'success';
        }
        case SetupStepStatus.Missing: {
            return 'warning';
        }
        case SetupStepStatus.NotApplicable:
        case SetupStepStatus.NotChecked: {
            return 'secondary';
        }
    }
}

function StepDetail({ step }: { readonly step: SetupStepModel }) {
    if (step.detail === null && step.items.length === 0) return null;
    return (
        <div className="flex flex-col gap-1 pl-1 text-xs text-muted-foreground">
            {step.detail !== null && <p>{step.detail}</p>}
            {step.items.length > 0 && (
                <ul className="flex list-disc flex-col gap-0.5 pl-5">
                    {step.items.map((item) => (
                        <li key={item.key}>
                            <Link
                                className="underline underline-offset-4"
                                href={item.href}
                            >
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
