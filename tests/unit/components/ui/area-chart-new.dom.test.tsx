import type * as Recharts from 'recharts';

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
    yAxis: [] as unknown[],
}));

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({
            children,
        }: ComponentProps<typeof actual.ResponsiveContainer>) => (
            <actual.ResponsiveContainer height={300} width={600}>
                {children}
            </actual.ResponsiveContainer>
        ),
        YAxis: (properties: ComponentProps<typeof actual.YAxis>) => {
            captured.yAxis.push(properties.domain);
            return <actual.YAxis {...properties} />;
        },
    };
});

import AreaChartNew from '~/components/ui/chart/area-chart-new';

describe('the shared area chart', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        captured.yAxis = [];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('fits the value axis to the data instead of starting at zero', () => {
        act(() => {
            root.render(
                <AreaChartNew
                    area={{ dataKey: 'value' }}
                    config={{ sensor: { label: 'Air pressure' } }}
                    data={[
                        { date: '14 May', value: 1010 },
                        { date: '15 May', value: 1014 },
                    ]}
                    tooltip={{ labelKey: 'date', nameKey: 'sensor' }}
                    xAxis={{ dataKey: 'date' }}
                    yAxis={{ tickFormatter: (value) => `${value} hPa` }}
                />,
            );
        });
        expect(captured.yAxis.at(-1)).toEqual(['auto', 'auto']);
    });
});
