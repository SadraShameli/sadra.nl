import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    patches: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        lifting: {
            settings: {
                update: {
                    useMutation: (options: { onSuccess?: () => unknown }) => ({
                        isPending: false,
                        mutate: (
                            patch: unknown,
                            callOptions?: { onSuccess?: () => unknown },
                        ) => {
                            harness.patches.push(patch);
                            options.onSuccess?.();
                            callOptions?.onSuccess?.();
                        },
                    }),
                },
            },
        },
        useUtils: () => ({
            lifting: { settings: { get: { invalidate: vi.fn() } } },
        }),
    },
}));

const { LiftingSettingsForm } =
    await import('~/app/(app)/profile/_components/LiftingSettingsForm');

const INITIAL = {
    availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
    barWeightKg: 20,
    defaultRestSeconds: 90,
    unitDistance: 'm' as const,
    unitLength: 'cm' as const,
    unitWeight: 'kg' as const,
    userId: 'lifter',
    weekStart: 'mon' as const,
};

async function flush(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('LiftingSettingsForm', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.patches = [];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<LiftingSettingsForm initial={INITIAL as never} />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function restInput(): HTMLInputElement {
        const label = [...container.querySelectorAll('label')].find(
            (candidate) => candidate.textContent === 'Default rest (seconds)',
        );
        const input = container.querySelector(
            `#${CSS.escape(label?.htmlFor ?? '')}`,
        );
        if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('no default rest input');
        }
        return input;
    }

    async function typeRest(value: string): Promise<void> {
        act(() => {
            Reflect.set(
                HTMLInputElement.prototype,
                'value',
                value,
                restInput(),
            );
            restInput().dispatchEvent(new Event('input', { bubbles: true }));
        });
        await flush();
    }

    async function save(): Promise<void> {
        const form = container.querySelector('form');
        if (form === null) throw new TypeError('no settings form');
        act(() => {
            form.requestSubmit();
        });
        await flush();
    }

    it('saves a restored value after an earlier save changed it', async () => {
        await typeRest('120');
        await save();
        await typeRest('90');
        await save();

        expect(harness.patches).toEqual([
            { defaultRestSeconds: 120 },
            { defaultRestSeconds: 90 },
        ]);
    });

    it('flags unsaved edits in the form footer and clears the flag once saved', async () => {
        expect(container.textContent).not.toContain('Unsaved changes');
        await typeRest('120');
        expect(container.textContent).toContain('Unsaved changes');
        await save();
        expect(container.textContent).not.toContain('Unsaved changes');
    });

    it('names every chosen unit and the week start in the server-rendered selects', () => {
        const html = renderToString(
            <LiftingSettingsForm initial={INITIAL as never} />,
        );
        const holder = document.createElement('div');
        holder.innerHTML = html;
        const shown = [...holder.querySelectorAll('[role="combobox"]')].map(
            (trigger) => trigger.textContent.trim(),
        );
        expect(shown).toEqual(['kg', 'm', 'cm', 'Monday']);
    });
});
