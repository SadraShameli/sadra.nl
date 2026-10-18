import { act } from 'react';

export function openDisclosure(container: ParentNode, label: string) {
    const trigger = [
        ...container.querySelectorAll<HTMLButtonElement>(
            'button[aria-expanded]',
        ),
    ].find((candidate) => candidate.textContent.trim() === label);
    if (trigger === undefined) throw new Error(`no disclosure ${label}`);
    act(() => {
        trigger.click();
    });
    const disclosure = trigger.closest<HTMLElement>(
        '[data-slot="collapsible"]',
    );
    if (disclosure === null) throw new Error(`no collapsible for ${label}`);
    return disclosure;
}
