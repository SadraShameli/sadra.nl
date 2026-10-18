import { LabelList } from 'recharts';

import { formatPercent } from '~/lib/format';

const LABEL_FONT_SIZE = 11;

const RATE_LABEL_OFFSET = 18;

const SAMPLE_LABEL_OFFSET = 5;

export const WIN_RATE_CHART_TOP_MARGIN = 36;

export function WinRateBarLabels() {
    return (
        <>
            <LabelList
                dataKey="winRate"
                fill="var(--foreground)"
                fontSize={LABEL_FONT_SIZE}
                formatter={(v: unknown) =>
                    typeof v === 'number' ? formatPercent(v, 0) : ''
                }
                offset={RATE_LABEL_OFFSET}
                position="top"
            />
            <LabelList
                dataKey="count"
                fill="var(--muted-foreground)"
                fontSize={LABEL_FONT_SIZE}
                formatter={(v: unknown) =>
                    typeof v === 'number' ? `n=${String(v)}` : ''
                }
                offset={SAMPLE_LABEL_OFFSET}
                position="top"
            />
        </>
    );
}
