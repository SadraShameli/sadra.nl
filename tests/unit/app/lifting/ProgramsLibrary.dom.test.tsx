import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    chooseRowAction,
    clickRowAction,
    closeRowActions,
    confirmRowAction,
    openRowActions,
    rowActionItem,
    rowActionLabels,
    rowActionsTriggers,
} from '../../components/rowActionsMenu';

const ENROLLMENT_ID = '00000000-0000-4000-8000-000000000051';
const PROGRAM_ID = '00000000-0000-4000-8000-000000000052';
const PAUSED_ENROLLMENT_ID = '00000000-0000-4000-8000-000000000053';
const PROGRAM_NAME = 'Two day plan';
const PROGRAM_HREF = '/lifting/programs/two-day-plan';

const harness = vi.hoisted(() => ({
    deleted: [] as unknown[],
    listMineInvalidate: vi.fn(() => Promise.resolve()),
    mutation:
        (sink: unknown[]) => (options?: { onSuccess?: () => unknown }) => ({
            isPending: false,
            mutate: (input: unknown) => {
                sink.push(input);
                void options?.onSuccess?.();
            },
        }),
    nextDayInvalidate: vi.fn(() => Promise.resolve()),
    unenrolled: [] as unknown[],
    updated: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => {
    const { mutation } = harness;
    const program = {
        category: 'strength',
        daysPerWeek: 2,
        description: null,
        id: PROGRAM_ID,
        isOfficial: false,
        lengthWeeks: 1,
        name: PROGRAM_NAME,
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
                    advance: { useMutation: mutation([]) },
                    deleteCustom: { useMutation: mutation(harness.deleted) },
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
                                    {
                                        currentDay: 2,
                                        currentWeek: 1,
                                        id: PAUSED_ENROLLMENT_ID,
                                        oneRepMaxes: {},
                                        programId: PROGRAM_ID,
                                        startDate: '2026-09-01',
                                        status: 'paused',
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
                    unenroll: { useMutation: mutation(harness.unenrolled) },
                    updateEnrollment: {
                        useMutation: mutation(harness.updated),
                    },
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
        harness.deleted.length = 0;
        harness.unenrolled.length = 0;
        harness.updated.length = 0;
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

    it('enters each card through its title and keeps Open in the card menu', () => {
        act(() => {
            root.render(<ProgramsLibrary officialPrograms={[]} />);
        });
        const titleLinks = [
            ...container.querySelectorAll<HTMLAnchorElement>(':scope h3 a'),
        ];
        expect(
            titleLinks.map((link) => [
                link.textContent,
                link.getAttribute('href'),
            ]),
        ).toEqual([
            [PROGRAM_NAME, PROGRAM_HREF],
            [PROGRAM_NAME, PROGRAM_HREF],
            [PROGRAM_NAME, PROGRAM_HREF],
        ]);
        expect(
            [...container.querySelectorAll(':scope a, :scope button')].filter(
                (control) => control.textContent.trim() === 'Open',
            ),
        ).toEqual([]);
        const triggers = rowActionsTriggers(PROGRAM_NAME);
        expect(triggers).toHaveLength(titleLinks.length);
        for (const index of triggers.keys()) {
            openRowActions(PROGRAM_NAME, index);
            expect(rowActionItem('Open').getAttribute('href')).toBe(
                PROGRAM_HREF,
            );
            closeRowActions();
        }
    });

    it('pauses and unenrolls the active program from its card menu, confirming the unenroll first', () => {
        act(() => {
            root.render(<ProgramsLibrary officialPrograms={[]} />);
        });
        openRowActions(PROGRAM_NAME, 0);
        expect(rowActionLabels()).toEqual(['Open', 'Pause', 'Unenroll']);
        clickRowAction('Pause');
        expect(harness.updated).toEqual([
            { id: ENROLLMENT_ID, status: 'paused' },
        ]);
        chooseRowAction(PROGRAM_NAME, 'Unenroll', 0);
        expect(harness.unenrolled).toEqual([]);
        confirmRowAction('Unenroll');
        expect(harness.unenrolled).toEqual([{ id: ENROLLMENT_ID }]);
    });

    it('resumes a paused enrollment and asks before unenrolling from it', () => {
        act(() => {
            root.render(<ProgramsLibrary officialPrograms={[]} />);
        });
        openRowActions(PROGRAM_NAME, 1);
        expect(rowActionLabels()).toEqual(['Open', 'Resume', 'Unenroll']);
        clickRowAction('Resume');
        expect(harness.updated).toEqual([
            { id: PAUSED_ENROLLMENT_ID, status: 'active' },
        ]);
        chooseRowAction(PROGRAM_NAME, 'Unenroll', 1);
        expect(harness.unenrolled).toEqual([]);
        expect(document.body.textContent).toContain(
            `Unenroll from ${PROGRAM_NAME}?`,
        );
        confirmRowAction('Unenroll');
        expect(harness.unenrolled).toEqual([{ id: PAUSED_ENROLLMENT_ID }]);
    });

    it('deletes a custom program from its card menu, confirming the delete first', () => {
        act(() => {
            root.render(<ProgramsLibrary officialPrograms={[]} />);
        });
        openRowActions(PROGRAM_NAME, 2);
        expect(rowActionLabels()).toEqual(['Open', 'Delete']);
        clickRowAction('Delete');
        expect(harness.deleted).toEqual([]);
        confirmRowAction('Delete');
        expect(harness.deleted).toEqual([{ id: PROGRAM_ID }]);
    });
});
