import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENT_LABELS } from '~/lib/notify/types';

import {
    chooseRowAction,
    clickRowAction,
    openRowActions,
    rowActionLabels,
} from '../../components/rowActionsMenu';

const harness = vi.hoisted(() => ({
    saved: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        user: {
            notification: {
                getMyPrefs: {
                    useQuery: () => ({
                        data: { loudness_alert: true },
                        isLoading: false,
                    }),
                },
                setPref: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: (input: unknown) => {
                            harness.saved.push(input);
                        },
                    }),
                },
            },
        },
        useUtils: () => ({}),
    },
}));

const { SubscriptionsPanel } =
    await import('~/app/(app)/profile/_components/sensor-hub/SubscriptionsPanel');

describe('SubscriptionsPanel row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.saved.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<SubscriptionsPanel />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows each subscription as text and keeps switches out of the table', () => {
        expect(container.querySelector('[role="switch"]')).toBeNull();
        const loudnessRow = [
            ...container.querySelectorAll(':scope tbody tr'),
        ].find((row) => row.textContent.includes(EVENT_LABELS.loudness_alert));
        expect(loudnessRow?.textContent).toContain('On');
    });

    it('subscribes to an event from its row menu', () => {
        openRowActions(EVENT_LABELS.device_created);
        expect(rowActionLabels()).toEqual(['Subscribe']);
        clickRowAction('Subscribe');
        expect(harness.saved).toEqual([
            { enabled: true, eventType: 'device_created' },
        ]);
    });

    it('unsubscribes from an event that already emails', () => {
        chooseRowAction(EVENT_LABELS.loudness_alert, 'Unsubscribe');
        expect(harness.saved).toEqual([
            { enabled: false, eventType: 'loudness_alert' },
        ]);
    });
});
