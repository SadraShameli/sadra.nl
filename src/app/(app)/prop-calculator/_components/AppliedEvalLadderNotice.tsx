'use client';

import { Button } from '~/components/ui/Button';

import {
    useCalculatorActions,
    useCalculatorInputs,
} from './CalculatorProvider';
import {
    describeAppliedEvalLadder,
    describeNonDefaultRungSizing,
} from './inputsSummaryRows';
import { UNAFFORDABLE_RUNG_LABEL } from './rungSizingLabels';

export enum EvalLadderScope {
    Applied = 'applied',
    NotUsedHere = 'notUsedHere',
}

const NOTICE_LEADS: Readonly<Record<EvalLadderScope, string>> = {
    [EvalLadderScope.Applied]: 'Eval ladder applied from the ladder lab:',
    [EvalLadderScope.NotUsedHere]:
        'Eval ladder applied from the ladder lab, but these results do not use it:',
};

const LISTS_RUNG_SIZING: Readonly<Record<EvalLadderScope, boolean>> = {
    [EvalLadderScope.Applied]: true,
    [EvalLadderScope.NotUsedHere]: false,
};

interface AppliedEvalLadderNoticeProperties {
    onCleared?: () => void;
    scope?: EvalLadderScope;
}

export function AppliedEvalLadderNotice({
    onCleared,
    scope = EvalLadderScope.Applied,
}: AppliedEvalLadderNoticeProperties) {
    const { state } = useCalculatorInputs();
    const { setEvalDayPolicy } = useCalculatorActions();
    const appliedLadder = describeAppliedEvalLadder(state);
    if (appliedLadder === null) return null;
    const rungSizing = LISTS_RUNG_SIZING[scope]
        ? describeNonDefaultRungSizing(state.rungSizing)
        : null;
    return (
        <div className="app-prop-calculator__applied-eval-ladder flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
                <p>
                    <span className="text-muted-foreground">
                        {NOTICE_LEADS[scope]}{' '}
                    </span>
                    <span className="font-medium text-foreground">
                        {appliedLadder}
                    </span>
                </p>
                {rungSizing !== null && (
                    <p>
                        <span className="text-muted-foreground">
                            {UNAFFORDABLE_RUNG_LABEL}:{' '}
                        </span>
                        <span className="font-medium text-foreground">
                            {rungSizing}
                        </span>
                    </p>
                )}
            </div>
            <Button
                aria-label="Clear the applied eval ladder"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => {
                    onCleared?.();
                    setEvalDayPolicy(null);
                }}
                size="sm"
                type="button"
                variant="outline"
            >
                Clear
            </Button>
        </div>
    );
}
