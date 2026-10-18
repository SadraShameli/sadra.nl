import type { StatStripItem } from '~/components/StatStrip';
import type { OutcomeTally } from '~/lib/trading/analytics';

import { MissingValue } from '~/components/MissingValue';
import { formatR } from '~/lib/format';

import { NO_R_REASON } from './outcomeReasons';

export function expectancyStat(tally: OutcomeTally): StatStripItem {
    return {
        caption: `avg R over ${outcomeCount(tally.withR)} with R`,
        id: 'expectancy',
        label: 'Expectancy',
        value:
            tally.withR > 0 ? (
                formatR(tally.avgR)
            ) : (
                <MissingValue reason={NO_R_REASON} />
            ),
    };
}

export function outcomeCount(count: number): string {
    return `${String(count)} outcome${count === 1 ? '' : 's'}`;
}
