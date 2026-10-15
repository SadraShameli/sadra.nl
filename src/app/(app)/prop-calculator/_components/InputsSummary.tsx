'use client';

import { useRef } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { Card } from '~/components/ui/Card';
import { cn } from '~/lib/utilities';

import {
    AppliedEvalLadderNotice,
    EvalLadderScope,
} from './AppliedEvalLadderNotice';
import { useCalculatorInputs } from './CalculatorProvider';
import { EditInputsDialog } from './EditInputsDialog';
import { inputsSummaryRows } from './inputsSummaryRows';

interface InputsSummaryProperties {
    evalLadderScope?: EvalLadderScope;
}

export function InputsSummary({
    evalLadderScope = EvalLadderScope.Applied,
}: InputsSummaryProperties) {
    const { state } = useCalculatorInputs();
    const summaryReference = useRef<HTMLDivElement>(null);
    return (
        <Card
            className={cn(
                'app-prop-calculator__inputs-summary flex flex-col gap-3 px-5 py-4 outline-none',
                HEADER_SCROLL_MARGIN,
            )}
            ref={summaryReference}
            tabIndex={-1}
        >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
                    {inputsSummaryRows(state).map((row) => (
                        <div className="flex flex-col" key={row.field}>
                            <dt className="text-muted-foreground">
                                {row.label}
                            </dt>
                            <dd className="font-medium text-foreground">
                                {row.value}
                            </dd>
                        </div>
                    ))}
                </dl>
                <EditInputsDialog evalLadderScope={evalLadderScope} />
            </div>
            <AppliedEvalLadderNotice
                onCleared={() => summaryReference.current?.focus()}
                scope={evalLadderScope}
            />
        </Card>
    );
}
