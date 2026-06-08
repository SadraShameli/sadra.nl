'use client';

import { Fragment } from 'react';

import type { Stage, StageStatus } from '~/lib/accounting/runner-types';

import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperSeparator,
    StepperTitle,
} from '~/components/ui/Stepper';
import { DurationFormat } from '~/lib/lifting/format';
import { cn } from '~/lib/utils';

export interface StageState {
    durationMs?: number;
    status: StageStatus;
}

interface Props {
    stages: { id: Stage; label: string }[];
    state: Record<Stage, StageState>;
}

export function StageStepper({ stages, state }: Props) {
    const activeIndex = stages.findIndex(
        (s) => state[s.id].status === 'started',
    );
    const finishedCount = stages.filter(
        (s) => state[s.id].status === 'finished',
    ).length;
    const value = activeIndex === -1 ? finishedCount : activeIndex + 1;

    return (
        <Stepper
            className={cn('app-accounting__stage-stepper')}
            value={value || 1}
        >
            {stages.map((stage, index) => {
                const s = state[stage.id];
                const isLast = index === stages.length - 1;
                return (
                    <Fragment key={stage.id}>
                        <StepperItem
                            completed={s.status === 'finished'}
                            loading={s.status === 'started'}
                            step={index + 1}
                        >
                            <StepperIndicator />
                            <div className="flex flex-col gap-1">
                                <StepperTitle>{stage.label}</StepperTitle>
                                {s.status === 'finished' &&
                                    s.durationMs !== undefined && (
                                        <StepperDescription>
                                            {DurationFormat.ms(s.durationMs)}
                                        </StepperDescription>
                                    )}
                            </div>
                        </StepperItem>
                        {!isLast && <StepperSeparator />}
                    </Fragment>
                );
            })}
        </Stepper>
    );
}
