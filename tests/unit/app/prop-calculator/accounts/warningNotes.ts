const WARNING_NOTE_SELECTOR = '.app-warning-note';
const INLINE_DISPLAY_CLASS = 'inline-flex';

export function inlineWarningNotes(scope: ParentNode): Element[] {
    return warningNotes(scope).filter((note) =>
        note.classList.contains(INLINE_DISPLAY_CLASS),
    );
}

export function warningNotes(scope: ParentNode): Element[] {
    return [...scope.querySelectorAll(WARNING_NOTE_SELECTOR)];
}
