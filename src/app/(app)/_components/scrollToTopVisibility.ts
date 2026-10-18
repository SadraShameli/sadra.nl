export interface ScrollToTopSnapshot {
    readonly footerTop: null | number;
    readonly hasActionUnderButton: boolean;
    readonly scrollY: number;
    readonly viewportHeight: number;
}

export const ACTION_CLEARANCE_PX = 16;

export const INTERACTIVE_SELECTOR =
    'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"]';

const SHOW_AFTER_VIEWPORTS = 1;

export function isScrollToTopVisible(snapshot: ScrollToTopSnapshot): boolean {
    const hasScrolledFar =
        snapshot.scrollY > snapshot.viewportHeight * SHOW_AFTER_VIEWPORTS;
    const isFooterInView =
        snapshot.footerTop !== null &&
        snapshot.footerTop < snapshot.viewportHeight;
    return hasScrolledFar && !isFooterInView && !snapshot.hasActionUnderButton;
}
