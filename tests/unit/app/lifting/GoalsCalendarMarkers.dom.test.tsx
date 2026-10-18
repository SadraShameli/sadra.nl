import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TODAY = new Date('2026-10-15T12:00:00');

const harness = vi.hoisted(() => ({
    goal: (
        id: string,
        status: string,
        targetDate: null | string,
        achievedAt: Date | null,
    ) => ({
        achievedAt,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        exerciseId: null,
        exerciseName: null,
        exerciseSlug: null,
        id,
        kind: 'bodyweight',
        status,
        targetDate,
        targetValue: 80,
        userId: 'lifter',
    }),
    idle: () => ({ error: null, isPending: false, mutate: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => {
    const { goal, idle } = harness;
    return {
        api: {
            lifting: {
                goal: {
                    create: { useMutation: idle },
                    delete: { useMutation: idle },
                    list: {
                        useQuery: () => ({
                            data: [
                                goal(
                                    'goal-achieved',
                                    'achieved',
                                    null,
                                    new Date('2026-10-05T12:00:00'),
                                ),
                                goal(
                                    'goal-upcoming',
                                    'active',
                                    '2026-10-20',
                                    null,
                                ),
                                goal(
                                    'goal-overdue',
                                    'active',
                                    '2026-10-10',
                                    null,
                                ),
                            ],
                            isLoading: false,
                        }),
                    },
                    markAchieved: { useMutation: idle },
                    update: { useMutation: idle },
                },
                settings: {
                    get: { useQuery: () => ({ data: { unitWeight: 'kg' } }) },
                },
            },
            useUtils: () => ({}),
        },
    };
});

const { GoalsView } = await import('~/app/(app)/lifting/_components/GoalsView');

describe('GoalsView target calendar', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers({ now: TODAY, toFake: ['Date'] });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<GoalsView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    function dayButton(day: number): Element | null {
        return container.querySelector(
            `button[data-day="${CSS.escape(new Date(2026, 9, day).toLocaleDateString())}"]`,
        );
    }

    function nameOf(day: number): null | string {
        return dayButton(day)?.getAttribute('aria-label') ?? null;
    }

    function iconsOn(day: number): Element[] {
        return [...(dayButton(day)?.querySelectorAll('svg') ?? [])];
    }

    it('names each marked day for what happened on it, so a screen reader hears the marker', () => {
        expect(nameOf(5)).toBe('Monday, October 5th, 2026, Achieved');
        expect(nameOf(10)).toBe('Saturday, October 10th, 2026, Target overdue');
        expect(nameOf(20)).toBe('Tuesday, October 20th, 2026, Target upcoming');
        expect(nameOf(12)).toBe('Monday, October 12th, 2026');
    });

    it('draws one icon per marker inside the button, using phrasing content only', () => {
        const marked = [5, 10, 20];
        expect([...marked, 12].map((day) => iconsOn(day).length)).toEqual([
            1, 1, 1, 0,
        ]);
        expect(
            marked.map((day) => dayButton(day)?.querySelector('div') ?? null),
        ).toEqual([null, null, null]);
        expect(
            marked.flatMap((day) =>
                iconsOn(day).map((icon) => icon.getAttribute('aria-hidden')),
            ),
        ).toEqual(['true', 'true', 'true']);
    });

    it('tells the markers apart by icon alone, styling every day the same', () => {
        const plain = dayButton(12);
        for (const day of [5, 10, 20]) {
            expect(dayButton(day)?.className).toBe(plain?.className);
            expect(dayButton(day)?.parentElement?.className).toBe(
                plain?.parentElement?.className,
            );
        }
    });
});
