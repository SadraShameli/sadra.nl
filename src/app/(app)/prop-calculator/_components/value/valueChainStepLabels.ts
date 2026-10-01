import { ValueChainStepKind } from '~/lib/prop-calculator/advisor/value';

export const VALUE_CHAIN_STEP_LABEL: Readonly<
    Record<ValueChainStepKind, string>
> = {
    [ValueChainStepKind.EvalStart]: 'Eval start',
    [ValueChainStepKind.FirstPayoutEligible]: 'First payout eligible',
    [ValueChainStepKind.FreshFunded]: 'Fresh funded',
    [ValueChainStepKind.PostFirstPayout]: 'Post first payout',
};
