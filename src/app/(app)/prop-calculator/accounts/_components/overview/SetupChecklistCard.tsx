import Link from 'next/link';

import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { SetupStepStatus } from '~/lib/prop-accounts';

import { type SetupChecklistCardModel } from './overviewModel';

type SetupStepModel = SetupChecklistCardModel['steps'][number];

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
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
                Setup: {String(model.doneCount)} of {String(model.totalSteps)}{' '}
                steps done.{' '}
                <Link className="underline underline-offset-4" href={href}>
                    Finish the setup
                </Link>
            </p>
            <ul className="flex flex-wrap gap-2">
                {model.steps.map((step) => (
                    <li key={step.key}>
                        <Badge variant={statusVariant(step.status)}>
                            {step.label}: {step.statusLabel}
                        </Badge>
                    </li>
                ))}
            </ul>
        </div>
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
