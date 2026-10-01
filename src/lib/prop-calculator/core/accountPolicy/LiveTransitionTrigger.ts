import { type Dollars } from '~/lib/prop-calculator/core/lib/units';

import { type FirmPolicySource } from './FirmPolicySource';

export enum LiveTriggerKind {
    CumulativeAmount = 'cumulative-amount',
    Discretionary = 'discretionary',
    NotChecked = 'not-checked',
    PayoutCountPerAccount = 'payout-count-per-account',
    PayoutCountTotal = 'payout-count-total',
    SingleDayProfit = 'single-day-profit',
}

export interface LiveTriggerProgress {
    readonly cumulativePayoutDollars: Dollars;
    readonly largestSingleDayProfit: Dollars;
    readonly payoutCountAcrossFirm: number;
    readonly payoutCountThisAccount: number;
}

export abstract class LiveTransitionTrigger {
    abstract readonly kind: LiveTriggerKind;
    abstract readonly source: FirmPolicySource | undefined;

    abstract distance(progress: LiveTriggerProgress): null | number;
}

export class CumulativeAmountTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.CumulativeAmount;

    constructor(
        readonly amount: Dollars,
        readonly source: FirmPolicySource | undefined,
    ) {
        super();
    }

    distance(progress: LiveTriggerProgress): number {
        return Math.max(
            0,
            this.amount - progress.cumulativePayoutDollars,
        );
    }
}

export class DiscretionaryTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.Discretionary;

    constructor(readonly source: FirmPolicySource | undefined) {
        super();
    }

    distance(_progress: LiveTriggerProgress): null {
        return null;
    }
}

export class NotCheckedLiveTransitionTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.NotChecked;

    readonly source: undefined = undefined;

    distance(_progress: LiveTriggerProgress): null {
        return null;
    }
}

export class PayoutCountPerAccountTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.PayoutCountPerAccount;

    constructor(
        readonly cap: number,
        readonly source: FirmPolicySource | undefined,
        readonly conflictingCap?: number,
    ) {
        super();
    }

    distance(progress: LiveTriggerProgress): number {
        return Math.max(0, this.cap - progress.payoutCountThisAccount);
    }
}

export class PayoutCountTotalTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.PayoutCountTotal;

    constructor(
        readonly cap: number,
        readonly source: FirmPolicySource | undefined,
    ) {
        super();
    }

    distance(progress: LiveTriggerProgress): number {
        return Math.max(0, this.cap - progress.payoutCountAcrossFirm);
    }
}

export class SingleDayProfitTrigger extends LiveTransitionTrigger {
    readonly kind = LiveTriggerKind.SingleDayProfit;

    constructor(
        readonly amount: Dollars,
        readonly isAutomatic: boolean,
        readonly isExcessForfeited: boolean,
        readonly source: FirmPolicySource | undefined,
    ) {
        super();
    }

    distance(progress: LiveTriggerProgress): number {
        return Math.max(
            0,
            this.amount - progress.largestSingleDayProfit,
        );
    }
}
