import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    chooseRowAction,
    confirmRowAction,
} from '../../components/rowActionsMenu';

const harness = vi.hoisted(() => ({
    deleted: [] as unknown[],
    mutation: () => ({ isPending: false, mutate: vi.fn() }),
    rows: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => {
    return {
        api: {
            lifting: {
                measurement: {
                    create: { useMutation: harness.mutation },
                    delete: {
                        useMutation: () => ({
                            isPending: false,
                            mutate: (input: unknown) => {
                                harness.deleted.push(input);
                            },
                        }),
                    },
                    list: {
                        useQuery: () => ({
                            data: harness.rows,
                            isLoading: false,
                        }),
                    },
                },
                settings: {
                    get: {
                        useQuery: () => ({
                            data: { unitLength: 'cm', unitWeight: 'kg' },
                        }),
                    },
                },
            },
            useUtils: () => ({
                lifting: { measurement: { list: { invalidate: vi.fn() } } },
            }),
        },
    };
});

const { BodyView } = await import('~/app/(app)/lifting/_components/BodyView');
const { TooltipProvider } = await import('~/components/ui/tooltip');

function statValue(container: HTMLElement, label: string): string {
    const term = [...container.querySelectorAll('dt')].find(
        (candidate) => candidate.textContent === label,
    );
    const value = term?.nextElementSibling;
    return value?.tagName === 'DD' ? value.textContent : '';
}

describe('BodyView', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.deleted.length = 0;
        vi.stubGlobal(
            'ResizeObserver',
            class {
                disconnect(): void {
                    return;
                }
                observe(): void {
                    return;
                }
                unobserve(): void {
                    return;
                }
            },
        );
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function renderView() {
        act(() => {
            root.render(
                <TooltipProvider>
                    <BodyView />
                </TooltipProvider>,
            );
        });
    }

    it('compares weights logged in different units in one display unit', () => {
        harness.rows = [
            {
                id: 'latest',
                kind: 'weight',
                notes: null,
                takenAt: '2026-10-10',
                unit: 'lb',
                valueNumeric: 176.37,
            },
            {
                id: 'earlier',
                kind: 'weight',
                notes: null,
                takenAt: '2026-09-01',
                unit: 'kg',
                valueNumeric: 80,
            },
        ];
        renderView();
        expect(statValue(container, 'Weight 30-day')).toBe('+0.0');
    });

    it('deletes a measurement from its row menu only after the delete is confirmed', () => {
        harness.rows = [
            {
                id: 'waist-reading',
                kind: 'waist',
                notes: null,
                takenAt: '2026-10-10',
                unit: 'cm',
                valueNumeric: 82,
            },
        ];
        renderView();
        chooseRowAction('waist 82 cm', 'Delete');
        expect(harness.deleted).toEqual([]);
        expect(document.body.textContent).toContain(
            'waist 82 cm will be removed from your history.',
        );
        confirmRowAction('Delete');
        expect(harness.deleted).toEqual([{ id: 'waist-reading' }]);
    });
});
