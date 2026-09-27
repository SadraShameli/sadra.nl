export const PAYOUT_TOLERANCE_CENTS = 100;

export function isWithinPayoutTolerance(differenceCents: number): boolean {
    return Math.abs(differenceCents) <= PAYOUT_TOLERANCE_CENTS;
}
