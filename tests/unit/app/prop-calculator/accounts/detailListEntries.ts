export function detailListEntries(
    scope: ParentNode,
): (readonly [string, string])[] {
    return [...scope.querySelectorAll(':scope .app-detail-list dt')].map(
        (term) => [
            term.firstChild?.textContent ?? '',
            term.nextElementSibling?.textContent ?? '',
        ],
    );
}
