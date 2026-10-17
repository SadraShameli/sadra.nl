import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
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
                    delete: { useMutation: harness.mutation },
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
    const labelSpan = [...container.querySelectorAll('span')].find(
        (span) => span.textContent === label,
    );
    return labelSpan?.nextElementSibling?.textContent ?? '';
}

describe('BodyView', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
        act(() => {
            root.render(
                <TooltipProvider>
                    <BodyView />
                </TooltipProvider>,
            );
        });
        expect(statValue(container, 'Weight 30-day')).toBe('+0.0');
    });
});
