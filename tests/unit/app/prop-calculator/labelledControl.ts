import { act } from 'react';

interface FieldValidation {
    readonly hasError: boolean;
    readonly isInvalid: boolean;
}

export function ariaLabelledSelect(
    scope: ParentNode,
    labelText: string,
): HTMLButtonElement {
    const trigger = [...scope.querySelectorAll('button[role="combobox"]')].find(
        (candidate) => candidate.getAttribute('aria-label') === labelText,
    );
    if (!(trigger instanceof HTMLButtonElement)) {
        throw new TypeError(`no select labelled ${labelText}`);
    }
    return trigger;
}

export function fieldValidation(control: HTMLElement): FieldValidation {
    const error = control
        .closest('[data-slot="field"]')
        ?.querySelector('[data-slot="field-error"]');
    return {
        hasError: (error?.textContent ?? '') !== '',
        isInvalid: control.getAttribute('aria-invalid') === 'true',
    };
}

export function labelledControl<T extends HTMLElement>(
    scope: ParentNode,
    labelText: string,
    kind: abstract new () => T,
): T {
    const label = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === labelText,
    );
    if (label === undefined) throw new Error(`no label ${labelText}`);
    const control = document.querySelector(`#${CSS.escape(label.htmlFor)}`);
    if (!(control instanceof kind)) {
        throw new TypeError(`no control labelled ${labelText}`);
    }
    return control;
}

export function labelledSelect(
    scope: ParentNode,
    labelText: string,
): HTMLButtonElement {
    return labelledControl(scope, labelText, HTMLButtonElement);
}

export async function optionTexts(trigger: HTMLElement): Promise<string[]> {
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
    const texts = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].map((option) => option.textContent.trim());
    const listbox = document.querySelector('[role="listbox"]');
    await act(async () => {
        listbox?.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
        );
    });
    return texts;
}

export function selectedText(trigger: HTMLElement): string {
    return trigger.textContent.trim();
}
