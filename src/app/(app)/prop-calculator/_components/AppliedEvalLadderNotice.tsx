'use client';

import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Button } from '~/components/ui/button';

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
        <StatusRow
            actions={
                <Button
                    aria-label="Clear the applied eval ladder"
                    className="shrink-0"
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
            }
            className="app-prop-calculator__applied-eval-ladder"
            detail={
                rungSizing === null ? undefined : (
                    <>
                        {UNAFFORDABLE_RUNG_LABEL}:{' '}
                        <span className="font-medium text-foreground">
                            {rungSizing}
                        </span>
                    </>
                )
            }
            title={
                <>
                    <span className="font-normal text-muted-foreground">
                        {NOTICE_LEADS[scope]}{' '}
                    </span>
                    {appliedLadder}
                </>
            }
            tone={StatusTone.Neutral}
        />
    );
}
