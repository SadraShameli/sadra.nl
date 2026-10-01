import { formatCurrency } from '~/lib/format';

import { type PayoutAdviceViewModel } from './adviceViewModel';

export function PayoutAdviceCard({
    view,
}: {
    readonly view: PayoutAdviceViewModel;
}) {
    return (
        <div className="flex flex-col gap-1 text-sm">
            <p>{view.documentedText}</p>
            {view.noticeText !== null && (
                <p className="text-muted-foreground">{view.noticeText}</p>
            )}
            {view.engineHorizonCredit !== null && (
                <p>
                    Engine horizon credit{' '}
                    {formatCurrency(view.engineHorizonCredit, 2)}
                </p>
            )}
            {view.netAfterSplit !== null && (
                <p>
                    Net after the payout split{' '}
                    {formatCurrency(view.netAfterSplit, 2)}
                </p>
            )}
        </div>
    );
}
