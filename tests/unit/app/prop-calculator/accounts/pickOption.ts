import { act } from 'react';

export async function pickOption(
    trigger: HTMLElement,
    optionText: ((text: string) => boolean) | string,
) {
    const isWanted =
        typeof optionText === 'string'
            ? (text: string) => text === optionText
            : optionText;
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
    const option = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((candidate) => isWanted(candidate.textContent.trim()));
    if (option === undefined) {
        throw new Error(
            `no option ${typeof optionText === 'string' ? optionText : 'matching the test'}`,
        );
    }
    await act(async () => {
        option.focus();
        option.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}
