import { skipToken } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReadingSection from '~/app/(app)/_components/Reading/Reading';

const LOCATION = {
    id: 7,
    location_id: 'loc-rijswijk',
    location_name: 'Rijswijk',
};

const AIR_PRESSURE = {
    highest: 1014,
    latestReading: { at: Date.parse('2026-05-15T10:00:00Z'), value: 1012.19 },
    lowest: 1010,
    period_label: '24h',
    readings: [{ at: Date.parse('2026-05-15T10:00:00Z'), value: 1012.19 }],
    sensor: { name: 'Air Pressure', unit: 'hPa' },
};

const readingsInputs = vi.hoisted((): unknown[] => []);
const readingsState = vi.hoisted(() => ({ hasData: true }));

vi.mock('~/trpc/react', () => ({
    api: {
        location: {
            getLocationDevices: {
                useQuery: () => ({ data: { data: [] } }),
            },
            getLocations: {
                useQuery: () => ({ data: { data: [LOCATION] } }),
            },
        },
        reading: {
            getReadingsInput: {
                useQuery: (input: unknown) => {
                    readingsInputs.push(input);
                    return readingsState.hasData
                        ? {
                              data: { data: [AIR_PRESSURE] },
                              isFetched: true,
                              isLoading: false,
                              isRefetching: false,
                          }
                        : {
                              data: undefined,
                              isFetched: false,
                              isLoading: false,
                              isRefetching: false,
                          };
                },
            },
        },
    },
}));

beforeEach(() => {
    readingsInputs.length = 0;
    readingsState.hasData = true;
});

describe('ReadingSection', () => {
    it('keeps sensor tab references valid when sensor names contain spaces', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToString(<ReadingSection />);
        const tab = container.querySelector('[role="tab"]');
        expect(tab?.textContent).toBe('Air Pressure');
        const controlledId = tab?.getAttribute('aria-controls');
        if (!controlledId)
            throw new Error('The sensor tab has no controlled panel');
        expect(controlledId).not.toMatch(/\s/);
        const panel = container.querySelector(
            `[id="${CSS.escape(controlledId)}"]`,
        );
        expect(panel?.getAttribute('aria-labelledby')).toBe(tab?.id);
    });

    it('renders the sensor tabs and stat tiles on the first render, so nothing blanks out while effects catch up', () => {
        const html = renderToString(<ReadingSection />);

        expect(html).toContain('Air Pressure');
        expect(html).toContain('Latest');
        expect(html).toContain('1012.19');
    });

    it('asks for readings only once a location is known, never with a missing location', () => {
        renderToString(<ReadingSection />);

        expect(readingsInputs).not.toContain(undefined);
        expect(readingsInputs.every((input) => input !== skipToken)).toBe(true);
        expect(readingsInputs[0]).toMatchObject({ location_id: LOCATION.id });
    });

    it('holds the full panel height with a skeleton until readings arrive, even while the query waits', () => {
        readingsState.hasData = false;

        const html = renderToString(<ReadingSection />);

        expect(html).toContain('aria-label="Loading readings"');
        expect(html).not.toContain('Latest');
    });
});
