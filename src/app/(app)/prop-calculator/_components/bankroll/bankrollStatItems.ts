import { createElement, type ReactNode } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { type StatStripItem } from '~/components/StatStrip';

import { type BankrollProjectionSummary } from './bankrollModel';

export function growthStatItems(
    summary: BankrollProjectionSummary | null,
): readonly StatStripItem[] {
    return [
        {
            id: 'multiple',
            label: 'Multiple (P50 cash / start)',
            value: readyValue(summary, (ready) =>
                ready.multiple === null
                    ? createElement(MissingValue)
                    : `${ready.multiple.toFixed(2)}x`,
            ),
        },
        {
            id: 'measured-cycle-days',
            label: 'Measured cycle days',
            value: readyValue(summary, (ready) =>
                ready.measuredCycleDays === null
                    ? createElement(MissingValue)
                    : ready.measuredCycleDays.toFixed(1),
            ),
        },
    ];
}

export function readyValue<T>(
    data: null | T,
    format: (ready: T) => ReactNode,
): ReactNode {
    return data === null ? null : format(data);
}
