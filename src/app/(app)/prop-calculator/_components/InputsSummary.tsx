'use client';

import { useRef } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
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
        <ToolPanel
            actions={<EditInputsDialog evalLadderScope={evalLadderScope} />}
            className={cn(
                'app-prop-calculator__inputs-summary outline-none',
                HEADER_SCROLL_MARGIN,
            )}
            ref={summaryReference}
            tabIndex={-1}
            title="Inputs"
        >
            <StatStrip
                items={inputsSummaryRows(state).map((row) => ({
                    id: row.field,
                    label: row.label,
                    value: row.value,
                }))}
                size={StatStripSize.Compact}
            />
            <AppliedEvalLadderNotice
                onCleared={() => summaryReference.current?.focus()}
                scope={evalLadderScope}
            />
        </ToolPanel>
    );
}
