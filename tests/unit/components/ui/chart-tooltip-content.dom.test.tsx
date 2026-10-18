import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type ChartConfig,
    ChartContainer,
    ChartTooltipContent,
} from '~/components/ui/chart';

vi.mock('recharts', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
}));

const CONFIG: ChartConfig = {
    location: { label: 'Rijswijk' },
    sensor: { label: 'Air Pressure' },
};

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

async function renderTooltip(value: number): Promise<HTMLElement> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(
            <ChartContainer config={CONFIG}>
                <ChartTooltipContent
                    active
                    indicator="line"
                    labelKey="location"
                    nameKey="sensor"
                    payload={[
                        {
                            color: 'gold',
                            dataKey: 'value',
                            graphicalItemId: 'value',
                            name: 'value',
                            payload: { date: '10:00', value },
                            value,
                        },
                    ]}
                    valueFormatter={(reading) =>
                        `${reading.toLocaleString()} hPa`
                    }
                />
            </ChartContainer>,
        );
        await Promise.resolve();
    });
    return container;
}

describe('ChartTooltipContent', () => {
    it('shows the reading with its unit, apart from the series name', async () => {
        const container = await renderTooltip(1012);

        expect(container.textContent).toContain('Air Pressure');
        expect(container.textContent).toContain('1,012 hPa');
        const row = container.querySelector('.justify-between');
        expect(row?.className).toContain('gap-4');
    });

    it('still shows a reading of zero', async () => {
        const container = await renderTooltip(0);

        expect(container.textContent).toContain('0 hPa');
    });

    it('colours the series swatch with Tailwind v4 variable classes', async () => {
        const container = await renderTooltip(1012);

        const swatch = container.querySelector('[style*="--color-bg"]');
        expect(swatch?.className).toContain('bg-(--color-bg)');
    });
});
