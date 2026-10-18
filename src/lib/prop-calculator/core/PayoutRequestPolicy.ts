import { dollars, type Dollars, payoutRequestSizeSchema } from './lib/units';
import { type PayoutLadder } from './PayoutTiers';

export enum PayoutRequestPolicy {
    FullRequestOnly = 'full-request-only',
    UpToRequest = 'up-to-request',
}

export const DEFAULT_PAYOUT_REQUEST_POLICY = PayoutRequestPolicy.UpToRequest;

export interface PayoutMinimumSource {
    readonly minPayoutRequest: Dollars;
    readonly payoutLadder?: null | Pick<PayoutLadder, 'minRequestAmount'>;
}

export interface PayoutRequestSource extends PayoutMinimumSource {
    readonly label: string;
}

export class PayoutRequestPolicyError extends RangeError {
    constructor(message: string) {
        super(message);
        this.name = 'PayoutRequestPolicyError';
    }
}

export function effectivePayoutRequest(
    source: PayoutMinimumSource,
    requested: number,
): Dollars {
    return dollars(
        Math.max(validPayoutRequest(requested), minimumPayoutRequest(source)),
    );
}

export function fullPayoutRequest(
    source: PayoutRequestSource,
    requested: number | undefined,
): Dollars {
    if (requested === undefined) {
        throw new PayoutRequestPolicyError(
            `${source.label}: the full-request-only payout policy needs a payout request size`,
        );
    }
    return reachablePayoutRequest(source, validPayoutRequest(requested));
}

export function minimumPayoutRequest(source: PayoutMinimumSource): Dollars {
    return source.payoutLadder?.minRequestAmount ?? source.minPayoutRequest;
}

export function reachablePayoutRequest(
    source: PayoutRequestSource,
    requested: number,
): Dollars {
    const minimum = minimumPayoutRequest(source);
    if (requested < minimum) {
        throw new PayoutRequestPolicyError(
            `${source.label}: a payout request of $${requested} is below the $${minimum} minimum payout request, so it could never be paid`,
        );
    }
    return dollars(requested);
}

function validPayoutRequest(requested: number): number {
    if (!payoutRequestSizeSchema.safeParse(requested).success) {
        throw new PayoutRequestPolicyError(
            `A payout request must be a finite amount above $0, got ${requested}`,
        );
    }
    return requested;
}
