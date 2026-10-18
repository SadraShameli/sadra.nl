import { WarningNote } from '~/components/WarningNote';

export function GrossOnlyPayoutsNote({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <WarningNote className="text-xs">
            {count} paid {count === 1 ? 'payout has' : 'payouts have'} no net
            amount, so the gross amount is counted as received.
        </WarningNote>
    );
}
