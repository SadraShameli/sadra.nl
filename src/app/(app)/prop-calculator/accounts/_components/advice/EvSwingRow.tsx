import { signedCurrencyText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { formatGateCurrency, formatPercent } from '~/lib/format';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import {
    type EvSwingRowView,
    type EvSwingView,
    ValueSectionKind,
} from './adviceValueModel';

export function EvSwingRow({ view }: { readonly view: EvSwingView }) {
    switch (view.kind) {
        case ValueSectionKind.Failed: {
            return (
                <li className="text-sm text-muted-foreground">
                    Trade {view.index}: Left out: {view.reason}
                </li>
            );
        }
        case ValueSectionKind.NotModeled: {
            return (
                <li className="text-sm text-muted-foreground">
                    Trade {view.index}: the value of this trade is not modeled for this account.
                </li>
            );
        }
        case ValueSectionKind.Ready: {
            return <ReadySwingRow row={view.row} />;
        }
    }
}

function bustText(days: number): string {
    return days === 0
        ? 'with no rebuy lag assumed'
        : `after a ${String(days)}-day rebuy lag`;
}

function deltaText(label: string, delta: UncertainValue): string {
    const spread =
        delta.standardError === null
            ? ''
            : ` (± ${formatGateCurrency(delta.standardError)})`;
    return `${label}: ${signedCurrencyText(delta.value)} EV${spread}`;
}

function ReadySwingRow({ row }: { readonly row: EvSwingRowView }) {
    return (
        <li className="flex flex-col gap-0.5 text-sm">
            <span>
                Trade {row.index}, risk {row.risk.text} ({row.risk.label}), 1:{row.rr}:{' '}
                {deltaText('win', row.winDelta)}, {deltaText('loss', row.lossDelta)}; chance of a win{' '}
                {formatPercent(row.winProbability, 0)}.
            </span>
            {row.bust !== null && (
                <span className="text-muted-foreground">
                    A loss here busts the account: the value after it is a fresh
                    eval bought {bustText(row.bust.rebuyLagDays)}.
                </span>
            )}
        </li>
    );
}
