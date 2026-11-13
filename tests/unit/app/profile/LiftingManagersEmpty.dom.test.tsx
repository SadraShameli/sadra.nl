import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    idle: () => ({ isPending: false, mutate: vi.fn(), variables: undefined }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', async () => {
    const { trpcDoubleReact } = await import('../../../stubs/trpcDouble');
    return trpcDoubleReact({
        api: {
            lifting: {
                program: {
                    deleteCustom: { mutation: harness.idle },
                    listMine: {
                        query: () => ({
                            data: { enrollments: [], owned: [] },
                            isLoading: false,
                        }),
                    },
                    listOfficial: {
                        query: () => ({ data: [], isLoading: false }),
                    },
                    unenroll: { mutation: harness.idle },
                },
                workout: {
                    delete: { mutation: harness.idle },
                    list: {
                        query: () => ({ data: [], isLoading: false }),
                    },
                    update: { mutation: harness.idle },
                },
            },
            queryClient: () => ({}),
        },
    });
});

const { ProgramsManager } =
    await import('~/app/(app)/profile/_components/lifting/ProgramsManager');
const { WorkoutsManager } =
    await import('~/app/(app)/profile/_components/lifting/WorkoutsManager');

describe('empty lifting collections on the profile', () => {
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

    function linkTexts(): string[] {
        return [...container.querySelectorAll('a')].map(
            (link) => link.textContent,
        );
    }

    it('offers Start workout once and hides the workouts toolbar and table', () => {
        act(() => {
            root.render(<WorkoutsManager />);
        });
        expect(linkTexts()).toEqual(['Start workout']);
        expect(container.textContent).toContain('No workouts yet');
        expect(container.querySelector('input')).toBeNull();
        expect(container.querySelector('table')).toBeNull();
    });

    it('links the programs page once across custom programs and enrollments', () => {
        act(() => {
            root.render(<ProgramsManager />);
        });
        expect(linkTexts()).toEqual(['Programs page']);
        expect(container.textContent).toContain('No custom programs yet');
        expect(container.textContent).toContain('No enrollments yet');
        expect(container.querySelector('input')).toBeNull();
        expect(container.querySelector('table')).toBeNull();
    });
});
