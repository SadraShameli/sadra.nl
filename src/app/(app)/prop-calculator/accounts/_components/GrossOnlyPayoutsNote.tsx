export function GrossOnlyPayoutsNote({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <p className="text-xs text-amber-400">
            {count} paid {count === 1 ? 'payout has' : 'payouts have'} no net
            amount, so the gross amount is counted as received.
        </p>
    );
}
