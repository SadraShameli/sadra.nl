import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    deleteRowAction,
    downloadRowAction,
    editRowAction,
    linkRowAction,
    rowActionsColumn,
    RowActionsMenu,
} from '~/components/RowActionsMenu';
import {
    DataTable,
    type DataTableColumn,
    DataTablePhoneLayout,
} from '~/components/ui/data-table';

import {
    chooseRowAction,
    clickRowAction,
    confirmButton,
    confirmRowAction,
    isRowActionDisabled,
    openRowActions,
    rowActionItem,
    rowActionLabels,
} from './rowActionsMenu';

const FEE_LABEL = 'Lucid Trading fee';

describe('the row actions menu', () => {
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
        container.remove();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function renderFeeMenu(onEdit: () => void, onDelete: () => void) {
        act(() => {
            root.render(
                <RowActionsMenu
                    actions={[
                        editRowAction(onEdit),
                        deleteRowAction({
                            description: 'This fee is removed for good.',
                            onDelete,
                            title: 'Delete this fee?',
                        }),
                    ]}
                    label={FEE_LABEL}
                />,
            );
        });
    }

    it('runs a plain action straight from the menu', () => {
        const onEdit = vi.fn();
        renderFeeMenu(onEdit, vi.fn());
        chooseRowAction(FEE_LABEL, 'Edit');
        expect(onEdit).toHaveBeenCalledOnce();
    });

    it('asks before running a destructive action', () => {
        const onDelete = vi.fn();
        renderFeeMenu(vi.fn(), onDelete);
        chooseRowAction(FEE_LABEL, 'Delete');
        expect(onDelete).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Delete this fee?');
        confirmRowAction('Delete');
        expect(onDelete).toHaveBeenCalledOnce();
    });

    it('moves focus to the row trigger before an action runs, so a dialog it opens hands focus back to the row', () => {
        let focusedWhenRun: Element | null = null;
        renderFeeMenu(() => {
            focusedWhenRun = document.activeElement;
        }, vi.fn());
        const trigger = openRowActions(FEE_LABEL);
        clickRowAction('Edit');
        expect(focusedWhenRun).toBe(trigger);
    });

    it('returns focus to the row trigger when the delete confirmation is cancelled', async () => {
        renderFeeMenu(vi.fn(), vi.fn());
        const trigger = openRowActions(FEE_LABEL);
        clickRowAction('Delete');
        const cancel = confirmButton('Cancel');
        act(() => {
            cancel.click();
        });
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });
        });
        expect(document.activeElement).toBe(trigger);
    });

    it('marks an action it cannot run as disabled', () => {
        act(() => {
            root.render(
                <RowActionsMenu
                    actions={[editRowAction(vi.fn(), true)]}
                    label={FEE_LABEL}
                />,
            );
        });
        openRowActions(FEE_LABEL);
        expect(isRowActionDisabled('Edit')).toBe(true);
    });

    it('opens a record page and downloads a file from links in the menu', () => {
        const recordId = 'take-1';
        act(() => {
            root.render(
                <RowActionsMenu
                    actions={[
                        linkRowAction({
                            href: `/lifting/workouts/${recordId}`,
                            label: 'Open',
                        }),
                        downloadRowAction({
                            fileName: 'take-1.wav',
                            href: '/api/recording/1',
                            label: 'Download',
                        }),
                    ]}
                    label="Take 1"
                />,
            );
        });
        openRowActions('Take 1');
        expect(rowActionLabels()).toEqual(['Open', 'Download']);
        expect(rowActionItem('Open').getAttribute('href')).toBe(
            '/lifting/workouts/take-1',
        );
        expect(rowActionItem('Download').getAttribute('href')).toBe(
            '/api/recording/1',
        );
        expect(rowActionItem('Download').getAttribute('download')).toBe(
            'take-1.wav',
        );
    });

    it('shows no menu for a row with no actions', () => {
        act(() => {
            root.render(<RowActionsMenu actions={[]} label="Locked row" />);
        });
        expect(container.querySelector(':scope button')).toBeNull();
    });

    describe('in a table', () => {
        interface Fee {
            readonly amount: string;
            readonly name: string;
        }

        const FEES: Fee[] = [{ amount: '$129.00', name: 'Activation' }];

        function columns(
            onEdit: (fee: Fee, isFiltered: boolean) => void,
        ): DataTableColumn<Fee>[] {
            return [
                {
                    accessorKey: 'name',
                    header: 'Fee',
                    meta: { isRowHeader: true },
                },
                { accessorKey: 'amount', header: 'Amount' },
                rowActionsColumn<Fee>({
                    actionsOf: (fee, table) => [
                        editRowAction(() =>
                            onEdit(
                                fee,
                                table.store.state.columnFilters.length > 0,
                            ),
                        ),
                    ],
                    labelOf: (fee) => fee.name,
                }),
            ];
        }

        it('ends each row in the menu and hands the action its row and table', () => {
            const onEdit = vi.fn<(fee: Fee, isFiltered: boolean) => void>();
            act(() => {
                root.render(
                    <DataTable columns={columns(onEdit)} data={FEES} />,
                );
            });
            chooseRowAction('Activation', 'Edit');
            expect(onEdit).toHaveBeenCalledWith(FEES[0], false);
        });

        it('labels each value cell for the phone card and leaves the title and menu unlabelled', () => {
            act(() => {
                root.render(
                    <DataTable columns={columns(vi.fn())} data={FEES} />,
                );
            });
            const header = container.querySelector<HTMLElement>(
                ':scope tbody th[scope="row"]',
            );
            const cells = [
                ...container.querySelectorAll<HTMLElement>(':scope tbody td'),
            ];
            expect(header?.dataset.label).toBeUndefined();
            expect(cells.map((cell) => cell.dataset.label)).toEqual([
                'Amount',
                undefined,
            ]);
        });

        it('keeps a scrolling table free of phone labels', () => {
            act(() => {
                root.render(
                    <DataTable
                        columns={columns(vi.fn())}
                        data={FEES}
                        phoneLayout={DataTablePhoneLayout.Scroll}
                    />,
                );
            });
            expect(container.querySelector(':scope [data-label]')).toBeNull();
        });
    });
});
