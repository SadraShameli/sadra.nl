import { type ReactNode } from 'react';

import InfoPopover from '~/components/ui/info-popover';

const MISSING_VALUE_GLYPH = '–';

const MISSING_VALUE_LABEL = 'Not available';

export function MissingValue({ reason }: { readonly reason?: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <span aria-hidden>{MISSING_VALUE_GLYPH}</span>
            <span className="sr-only">{MISSING_VALUE_LABEL}</span>
            {reason === undefined ? null : (
                <InfoPopover title={MISSING_VALUE_LABEL}>{reason}</InfoPopover>
            )}
        </span>
    );
}
