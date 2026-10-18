import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENROLLMENT_ID = '00000000-0000-4000-8000-000000000051';
const PROGRAM_ID = '00000000-0000-4000-8000-000000000052';

const harness = vi.hoisted(() => ({
    listMineInvalidate: vi.fn(() => Promise.resolve()),
    mutation: (options?: { onSuccess?: () => unknown }) => ({
        isPending: false,
        mutate: () => {
            void options?.onSuccess?.();
        },
    }),
    nextDayInvalidate: vi.fn(() => Promise.resolve()),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/link', () => ({
    default: ({ children }: { children: unknown }) => children,
}));

vi.mock('~/trpc/react', () => {
    const { mutation } = harness;
    const program = {
        category: 'strength',
        daysPerWeek: 2,
        description: null,
        id: PROGRAM_ID,
        isOfficial: false,
        lengthWeeks: 1,
        name: 'Two day plan',
        ownerId: 'lifter',
        schedule: {
            weeks: [
                {
                    days: [
                        { blocks: [], name: 'Day A' },
                        { blocks: [], name: 'Day B' },
                    ],
                },
            ],
        },
        slug: 'two-day-plan',
    };
    return {
        api: {
            lifting: {
                program: {
                    advance: { useMutation: mutation },
                    deleteCustom: { useMutation: mutation },
                    listMine: {
                        useQuery: () => ({
                            data: {
                                enrollments: [
                                    {
                                        currentDay: 1,
                                        currentWeek: 1,
                                        id: ENROLLMENT_ID,
                                        oneRepMaxes: {},
                                        programId: PROGRAM_ID,
                                        startDate: '2026-10-01',
                                        status: 'active',
                                    },
                                ],
                                owned: [program],
                            },
                            isLoading: false,
                        }),
                    },
                    listOfficial: {
                        useQuery: () => ({ data: [], isLoading: false }),
                    },
                    nextDay: {
                        useQuery: () => ({
                            data: { day: { blocks: [], name: 'Day A' } },
                            isLoading: false,
                        }),
                    },
                    unenroll: { useMutation: mutation },
                    updateEnrollment: { useMutation: mutation },
                },
            },
            useUtils: () => ({
                lifting: {
                    program: {
                        listMine: { invalidate: harness.listMineInvalidate },
                        nextDay: { invalidate: harness.nextDayInvalidate },
                    },
                },
            }),
        },
    };
});

const { ProgramsLibrary } =
    await import('~/app/(app)/lifting/_components/ProgramsLibrary');

describe('ProgramsLibrary active enrollment', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

    it('refreshes the upcoming session preview after a day is marked done', async () => {
        act(() => {
            root.render(<ProgramsLibrary officialPrograms={[]} />);
        });
        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent.includes('Mark day done'),
        );
        if (button === undefined) throw new TypeError('no Mark day done');
        await act(async () => {
            button.click();
            await Promise.resolve();
        });
        expect(harness.nextDayInvalidate).toHaveBeenCalledWith({
            id: ENROLLMENT_ID,
        });
    });
});
