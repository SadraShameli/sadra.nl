export function statStripCaption(
    scope: ParentNode,
    label: string,
): HTMLElement | undefined {
    const caption = statStripValue(scope, label)?.nextElementSibling;
    return caption instanceof HTMLElement ? caption : undefined;
}

export function statStripLabels(scope: ParentNode): string[] {
    return [...scope.querySelectorAll('dt')].map(
        (term) => term.firstChild?.textContent ?? '',
    );
}

export function statStripValue(
    scope: ParentNode,
    label: string,
): HTMLElement | undefined {
    const term = [...scope.querySelectorAll('dt')].find(
        (candidate) => candidate.firstChild?.textContent === label,
    );
    const value = term?.nextElementSibling;
    return value instanceof HTMLElement ? value : undefined;
}
