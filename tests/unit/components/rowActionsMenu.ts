import { act } from 'react';

export function chooseRowAction(
    rowLabel: string,
    actionLabel: string,
    index = 0,
): void {
    openRowActions(rowLabel, index);
    clickRowAction(actionLabel);
}

export function clickRowAction(actionLabel: string): void {
    const item = rowActionItem(actionLabel);
    act(() => {
        item.click();
    });
}

export function closeRowActions(): void {
    const active = document.activeElement;
    if (active === null) throw new Error('no open row actions');
    act(() => {
        active.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
        );
    });
}

export function confirmButton(label: string): HTMLButtonElement {
    const button = [
        ...document.body.querySelectorAll<HTMLButtonElement>(
            ':scope [role="alertdialog"] button',
        ),
    ].find((candidate) => candidate.textContent === label);
    if (button === undefined) throw new Error(`no ${label} confirmation`);
    return button;
}

export function confirmRowAction(confirmLabel: string): void {
    const button = confirmButton(confirmLabel);
    act(() => {
        button.click();
    });
}

export function isRowActionDisabled(label: string): boolean {
    return rowActionItem(label).getAttribute('aria-disabled') === 'true';
}

export function openRowActions(rowLabel: string, index = 0): HTMLButtonElement {
    const trigger = rowActionsTrigger(rowLabel, index);
    act(() => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
    return trigger;
}

export function rowActionItem(label: string): HTMLElement {
    const found = [
        ...document.body.querySelectorAll<HTMLElement>(
            ':scope [role="menuitem"]',
        ),
    ].find((candidate) => candidate.textContent === label);
    if (found === undefined) throw new Error(`no ${label} item`);
    return found;
}

export function rowActionLabels(): string[] {
    return [
        ...document.body.querySelectorAll<HTMLElement>(
            ':scope [role="menuitem"]',
        ),
    ].map((item) => item.textContent);
}

export function rowActionsTrigger(
    rowLabel: string,
    index = 0,
): HTMLButtonElement {
    const trigger = rowActionsTriggers(rowLabel)[index];
    if (trigger === undefined) throw new Error(`no actions for ${rowLabel}`);
    return trigger;
}

export function rowActionsTriggers(rowLabel: string): HTMLButtonElement[] {
    return [
        ...document.body.querySelectorAll<HTMLButtonElement>(
            `:scope button[aria-label="Actions for ${CSS.escape(rowLabel)}"]`,
        ),
    ];
}
