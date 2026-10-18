import { NOT_APPLICABLE } from '~/lib/format';

export const PENDING_FIGURE = 'Pending';

export const UNAVAILABLE_FIGURE = 'Not available';

export function hasFigure(text: string): boolean {
    return text !== '' && !isMissingFigure(text);
}

export function isMissingFigure(text: string): boolean {
    return text === NOT_APPLICABLE || text === UNAVAILABLE_FIGURE;
}

export function isPendingFigure(text: string): boolean {
    return text === PENDING_FIGURE;
}
