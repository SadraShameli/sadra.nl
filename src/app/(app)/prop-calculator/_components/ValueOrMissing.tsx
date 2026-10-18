import { type ReactNode } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { NOT_APPLICABLE } from '~/lib/format';

export function ValueOrMissing({
    reason,
    value,
}: {
    readonly reason?: ReactNode;
    readonly value: null | string;
}) {
    return value === null || value === NOT_APPLICABLE ? (
        <MissingValue reason={reason} />
    ) : (
        value
    );
}
