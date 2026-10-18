const SENTENCE_END = /[.!?]$/u;

export function messageWithConsequence(
    message: string,
    consequence: string,
): string {
    return `${periodTerminated(message)} ${consequence}`;
}

export function periodTerminated(text: string): string {
    const trimmed = text.trim();
    return SENTENCE_END.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function sentenceOf(text: string): string {
    const trimmed = text.trim();
    return periodTerminated(
        `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`,
    );
}
