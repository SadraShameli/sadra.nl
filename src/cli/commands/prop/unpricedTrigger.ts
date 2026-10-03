import { formatCurrency } from '~/lib/format';
import { findFirm, type Plan } from '~/lib/prop-calculator';
import { verifiedCumulativeTriggerOf } from '~/lib/prop-calculator/advisor/policy';

export enum UnpricedTriggerSurface {
    Dp = 'dp',
    Ladder = 'ladder',
}

const UNPRICED_TRIGGER_REASON: Readonly<
    Record<UnpricedTriggerSurface, string>
> = {
    [UnpricedTriggerSurface.Dp]:
        'Neither the DP values nor the simulate() replay below send an account live at that amount, so every account keeps collecting payouts past it and the payout figures are optimistic once the trigger would have ended it. prop sim and prop optimize funded price it.',
    [UnpricedTriggerSurface.Ladder]:
        'The ladder search scores the eval phase only, so no payout is simulated and the trigger does not enter these figures. prop sim and prop optimize funded price it.',
};

export function unpricedTriggerLine(
    plan: Plan,
    surface: UnpricedTriggerSurface,
): null | string {
    const trigger = verifiedCumulativeTriggerOf(
        findFirm(plan.id.firm)?.accountPolicy,
        plan,
    );
    if (trigger === null) return null;
    const { fetchedOn, quote, url } = trigger.source;
    return `The firm's confirmed cumulative payout trigger is not priced here: an account is sent live once the payouts it receives, counted after the profit split, total ${formatCurrency(trigger.amount, 0)} (source: ${url}, fetched ${fetchedOn}, quote: "${quote}"). ${UNPRICED_TRIGGER_REASON[surface]}`;
}
