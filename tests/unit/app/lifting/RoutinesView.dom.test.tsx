import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LEG_DAY_ID = '00000000-0000-4000-8000-000000000301';
const PULL_DAY_ID = '00000000-0000-4000-8000-000000000302';

interface StartOptions {
    readonly onError?: (error: { message: string }) => void;
}

const harness = vi.hoisted(() => ({
    isStartPending: false,
    started: [] as unknown[],
    startOptions: undefined as StartOptions | undefined,
    startVariables: undefined as undefined | { routineId: string },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('~/trpc/react', () => ({
    api: {
        lifting: {
            routine: {
                delete: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: vi.fn(),
                        variables: undefined,
                    }),
                },
                list: {
                    useQuery: () => ({
                        data: [
                            {
                                blocks: [{ exerciseSlug: 'barbell-squat' }],
                                id: LEG_DAY_ID,
                                name: 'Leg day',
                            },
                            {
                                blocks: [{ exerciseSlug: 'pull-up' }],
                                id: PULL_DAY_ID,
                                name: 'Pull day',
                            },
                        ],
                        isLoading: false,
                    }),
                },
            },
            workout: {
                start: {
                    useMutation: (options: StartOptions) => {
                        harness.startOptions = options;
                        return {
                            isPending: harness.isStartPending,
                            mutate: (input: unknown) => {
                                harness.started.push(input);
                            },
                            variables: harness.startVariables,
                        };
                    },
                },
            },
        },
        useUtils: () => ({}),
    },
}));

const { RoutinesView } =
    await import('~/app/(app)/lifting/_components/RoutinesView');

describe('RoutinesView start buttons', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.isStartPending = false;
        harness.started.length = 0;
        harness.startOptions = undefined;
        harness.startVariables = undefined;
        vi.mocked(toast.error).mockClear();
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

    function render(): void {
        act(() => {
            root.render(<RoutinesView />);
        });
    }

    function startButtons(): HTMLButtonElement[] {
        return [...container.querySelectorAll('button')].filter(
            (button) => button.textContent.trim() === 'Start',
        );
    }

    it('counts a one-exercise routine in the singular', () => {
        render();
        expect(document.body.textContent).toContain('1 exercise');
        expect(document.body.textContent).not.toContain('1 exercises');
    });

    it('starts the chosen routine', () => {
        render();
        act(() => {
            startButtons()[1]?.click();
        });
        expect(harness.started).toEqual([{ routineId: PULL_DAY_ID }]);
    });

    it('disables every start and shows a spinner on the routine being started', () => {
        harness.isStartPending = true;
        harness.startVariables = { routineId: LEG_DAY_ID };
        render();
        const [legDay, pullDay] = startButtons();
        expect(legDay?.disabled).toBe(true);
        expect(pullDay?.disabled).toBe(true);
        expect(legDay?.querySelector('[role="status"]')).not.toBeNull();
        expect(pullDay?.querySelector('[role="status"]')).toBeNull();
    });

    it('shows a toast when the workout could not be started', () => {
        render();
        act(() => {
            harness.startOptions?.onError?.({ message: 'Could not start' });
        });
        expect(toast.error).toHaveBeenCalledWith('Could not start');
    });
});
