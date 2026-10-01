import { fundedCycleSeedFromTracker } from '~/lib/prop-calculator/advisor/FundedFromStateSweep';
import {
    type DocumentedPolicySpec,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { type Plan, TradingPhase } from '~/lib/prop-calculator/core';
import {
    type FromStateSimInputs,
    type SimStart,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';

import {
    notModeled,
    type ValueOutcome,
    valueResult,
    ValueUnavailableReason,
} from './ValueEstimate';

export function startStateOf(
    plan: Plan,
    account: ReconstructedFundedOrEvalAccount,
): SimStart {
    if (account.kind === TradingPhase.Eval) {
        return { phase: TradingPhase.Eval, state: account.state };
    }
    if (account.fundedTracker === null) {
        throw new Error(
            'valueAtState: a funded account needs its funded cycle tracker',
        );
    }
    return {
        phase: TradingPhase.Funded,
        seed: fundedCycleSeedFromTracker(
            plan,
            account.state,
            account.fundedTracker,
        ),
        state: account.state,
    };
}

export function valueAtState(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
): ValueOutcome {
    if (account.kind === ReconstructedLiveKind.Live) {
        return notModeled(ValueUnavailableReason.LiveNotModeled);
    }
    const base = toSimInputs(account.plan, spec);
    const inputs: FromStateSimInputs = {
        ...base,
        start: startStateOf(base.plan, account),
    };
    const out = simulateFromState(inputs);
    return valueResult(
        {
            creditFree: out.estimates.fromStateExpectedRealizedCash,
            creditInclusive: out.estimates.fromStateExpectedCash,
        },
        spec.run.seed,
        spec.run.trials,
    );
}
