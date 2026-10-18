import { act } from 'react';

export function cancelDialog(): void {
    const button = dialogButton('Cancel');
    act(() => {
        button.click();
    });
}

export function dialogButton(label: string): HTMLButtonElement {
    const button = [
        ...document.body.querySelectorAll<HTMLButtonElement>(
            ':scope [role="dialog"] button',
        ),
    ].find((candidate) => candidate.textContent === label);
    if (button === undefined) throw new Error(`no ${label} button`);
    return button;
}

export function dialogControl(label: string): HTMLElement {
    const labelNode = [
        ...document.body.querySelectorAll<HTMLLabelElement>(
            ':scope [role="dialog"] label',
        ),
    ].find((candidate) => candidate.textContent === label);
    const control =
        labelNode === undefined
            ? null
            : document.querySelector<HTMLElement>(
                  `#${CSS.escape(labelNode.htmlFor)}`,
              );
    if (control === null) throw new Error(`no ${label} control`);
    return control;
}

export function dialogField(label: string): HTMLInputElement {
    const control = dialogControl(label);
    if (!(control instanceof HTMLInputElement)) {
        throw new TypeError(`${label} is not an input`);
    }
    return control;
}

export function dialogTitled(title: string): HTMLElement {
    const dialog = findDialogTitled(title);
    if (dialog === null) throw new Error(`no dialog titled ${title}`);
    return dialog;
}

export function findDialogTitled(title: string): HTMLElement | null {
    return (
        [
            ...document.body.querySelectorAll<HTMLElement>(
                ':scope [role="dialog"]',
            ),
        ].find((candidate) => {
            const titleId = candidate.getAttribute('aria-labelledby');
            return (
                titleId !== null &&
                document.querySelector(`#${CSS.escape(titleId)}`)
                    ?.textContent === title
            );
        }) ?? null
    );
}

export function isDialogOpen(): boolean {
    return document.body.querySelector(':scope [role="dialog"]') !== null;
}

export async function submitDialog(
    label: string,
    settle: () => Promise<unknown>,
): Promise<void> {
    const button = dialogButton(label);
    await act(async () => {
        button.click();
        await settle();
    });
}

export function typeInto(control: HTMLElement, value: string): void {
    act(() => {
        Reflect.set(
            control instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
            'value',
            value,
            control,
        );
        control.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
