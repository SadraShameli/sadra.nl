import { type SimOutputs } from '~/lib/prop-calculator';

export function perTrialRowsTotal(
    out: Pick<SimOutputs, 'costBreakdown'>,
): number {
    const { activationFee, evalFee, resetFeesTotal, subscriptionPerTrial } =
        out.costBreakdown;
    return activationFee + evalFee + resetFeesTotal + subscriptionPerTrial;
}
