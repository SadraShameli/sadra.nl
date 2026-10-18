import { describe, expect, it } from 'vitest';

import { isScrollToTopVisible } from '~/app/(app)/_components/scrollToTopVisibility';

const VIEWPORT_HEIGHT_PX = 800;

const FAR_DOWN = {
    footerTop: 4000,
    hasActionUnderButton: false,
    scrollY: 1200,
    viewportHeight: VIEWPORT_HEIGHT_PX,
};

describe('the scroll to top button', () => {
    it('shows once the reader is more than a screen down the page', () => {
        expect(isScrollToTopVisible(FAR_DOWN)).toBe(true);
    });

    it('stays hidden within the first screen', () => {
        expect(isScrollToTopVisible({ ...FAR_DOWN, scrollY: 400 })).toBe(false);
    });

    it('steps aside once the footer comes into view', () => {
        expect(isScrollToTopVisible({ ...FAR_DOWN, footerTop: 600 })).toBe(
            false,
        );
    });

    it('steps aside while a button or link sits under it', () => {
        expect(
            isScrollToTopVisible({ ...FAR_DOWN, hasActionUnderButton: true }),
        ).toBe(false);
    });

    it('shows on a page without a footer', () => {
        expect(isScrollToTopVisible({ ...FAR_DOWN, footerTop: null })).toBe(
            true,
        );
    });
});
