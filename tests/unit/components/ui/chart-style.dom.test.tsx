import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChartConfig, ChartContainer } from '~/components/ui/chart';

const HOSTILE_KEY = 'Shop} body { display: none } .x {';

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

describe('ChartContainer styles', () => {
    it('writes color variables only for keys that are plain identifiers', async () => {
        const config: ChartConfig = {
            [HOSTILE_KEY]: { color: 'red', label: 'Shop' },
            safe_key: { color: 'blue', label: 'Safe' },
        };
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ChartContainer config={config}>
                    <div />
                </ChartContainer>,
            );
            await Promise.resolve();
        });

        const css = container.querySelector('style')?.textContent ?? '';
        expect(css).toContain('--color-safe_key: blue;');
        expect(css).not.toContain('display: none');
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
    });
});
