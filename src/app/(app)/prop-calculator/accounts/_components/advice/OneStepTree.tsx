import { uncertainCurrencyText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { formatPercent } from '~/lib/format';

import { type OneStepTreeView, VALUE_BASIS_TEXT } from './adviceValueModel';

export function OneStepTree({ tree }: { readonly tree: OneStepTreeView }) {
    return (
        <div
            aria-label="One-step value tree"
            className="flex flex-col gap-1 text-sm"
            role="group"
        >
            <p>Now: {uncertainCurrencyText(tree.valueNow)}</p>
            <p>
                After a win ({formatPercent(tree.winProbability, 0)}):{' '}
                {uncertainCurrencyText(tree.valueAfterWin)}
            </p>
            <p>
                After a loss ({formatPercent(1 - tree.winProbability, 0)}):{' '}
                {uncertainCurrencyText(tree.valueAfterLoss)}
            </p>
            <p>
                Continuation value, p × V(win) + (1 - p) × V(loss):{' '}
                {uncertainCurrencyText(tree.continuation)}
            </p>
            <p className="text-muted-foreground">{VALUE_BASIS_TEXT}</p>
        </div>
    );
}
