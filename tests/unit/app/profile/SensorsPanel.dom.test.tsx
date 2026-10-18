import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    cancelDialog,
    dialogField,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    openRowActions,
} from '../../components/rowActionsMenu';

const UNIT_ID = 3;

const harness = vi.hoisted(() => ({
    query: (data: unknown) => () => ({ data, isLoading: false }),
    recorder: (sink: unknown[]) => () => ({
        isPending: false,
        mutate: (input: unknown) => {
            sink.push(input);
        },
        variables: undefined,
    }),
    renamed: [] as unknown[],
    unitsDeleted: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => {
    const { query, recorder } = harness;
    return {
        api: {
            device: { listAdmin: { useQuery: query([]) } },
            location: { listAdmin: { useQuery: query([]) } },
            sensor: {
                create: { useMutation: recorder([]) },
                delete: { useMutation: recorder([]) },
                listAdmin: {
                    useQuery: query([
                        {
                            created_at: new Date('2026-09-01T00:00:00Z'),
                            id: 9,
                            name: 'Light',
                            unit: 'lux',
                        },
                    ]),
                },
                listDeviceMappings: { useQuery: query([]) },
                update: { useMutation: recorder([]) },
            },
            sensorUnit: {
                create: { useMutation: recorder([]) },
                delete: { useMutation: recorder(harness.unitsDeleted) },
                list: { useQuery: query([{ id: UNIT_ID, value: 'lux' }]) },
                update: { useMutation: recorder(harness.renamed) },
            },
            useUtils: () => ({}),
        },
    };
});

const { SensorsPanel } =
    await import('~/app/(app)/profile/_components/sensor-hub/SensorsPanel');

function settle(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('SensorsPanel unit list', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.renamed.length = 0;
        harness.unitsDeleted.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<SensorsPanel />);
        });
        const manageUnits = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Manage units',
        );
        if (manageUnits === undefined) throw new Error('no Manage units');
        act(() => {
            manageUnits.click();
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('renames a unit in a dialog opened from its row menu', async () => {
        chooseRowAction('lux', 'Rename');
        const field = dialogField('Unit');
        expect(field.value).toBe('lux');
        typeInto(field, 'lx');
        await submitDialog('Save', settle);
        expect(harness.renamed).toEqual([{ id: UNIT_ID, value: 'lx' }]);
    });

    it('hands focus back to the unit menu when the rename dialog is cancelled', async () => {
        const trigger = openRowActions('lux');
        clickRowAction('Rename');
        cancelDialog();
        await act(settle);
        expect(document.activeElement).toBe(trigger);
    });

    it('deletes a unit only after the delete is confirmed', () => {
        chooseRowAction('lux', 'Delete');
        expect(harness.unitsDeleted).toEqual([]);
        confirmRowAction('Delete');
        expect(harness.unitsDeleted).toEqual([{ id: UNIT_ID }]);
    });
});
