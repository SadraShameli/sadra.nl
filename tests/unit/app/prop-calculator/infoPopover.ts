import { act } from 'react';

export function infoContent(scope: ParentNode, title: string): HTMLElement {
    const button = infoButton(scope, title);
    if (button === null) throw new Error(`no info button for ${title}`);
    return openedInfoContent(button);
}

export function infoContentOrNull(
    scope: ParentNode,
    title: string,
): HTMLElement | null {
    const button = infoButton(scope, title);
    return button === null ? null : openedInfoContent(button);
}

export function infoText(scope: ParentNode, title: string): string {
    return infoContent(scope, title).textContent;
}

export function withInfoTexts(scope: Element): string {
    const buttons = [
        ...scope.querySelectorAll<HTMLButtonElement>(
            'button[aria-label^="About "]',
        ),
    ];
    return [scope.textContent, ...buttons.map(openedInfoText)].join('\n');
}

function infoButton(
    scope: ParentNode,
    title: string,
): HTMLButtonElement | null {
    return (
        [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
            (button) => button.getAttribute('aria-label') === `About ${title}`,
        ) ?? null
    );
}

function openedInfoContent(button: HTMLButtonElement): HTMLElement {
    if (button.getAttribute('aria-expanded') !== 'true') {
        act(() => {
            button.click();
        });
    }
    const contentId = button.getAttribute('aria-controls');
    const content =
        contentId === null
            ? null
            : document.querySelector<HTMLElement>(`#${CSS.escape(contentId)}`);
    if (content === null) throw new Error('the info popover did not open');
    return content;
}

function openedInfoText(button: HTMLButtonElement): string {
    return openedInfoContent(button).textContent;
}
