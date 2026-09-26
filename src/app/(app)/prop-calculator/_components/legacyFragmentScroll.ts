import { subnavHref } from '~/app/(app)/_components/routeSubnavLinks';
import {
    type LegacySection,
    legacySectionTarget,
} from '~/lib/site/legacyCalculatorLinks';

export enum FragmentScrollStep {
    NoOp = 'no-op',
    Pending = 'pending',
    ScrollTo = 'scroll-to',
}

export interface HubLegacyTarget {
    fragment: LegacySection;
    href: string;
    route: string;
}

const PENDING_PANEL_SELECTOR = '.animate-pulse';
const SCROLL_WATCH_TIMEOUT_MS = 5000;
const USER_SCROLL_EVENTS = ['keydown', 'pointerdown', 'touchmove', 'wheel'];

export function hubLegacyTarget(
    hash: string,
    search: string,
    lastQuery: null | string,
): HubLegacyTarget | null {
    const target = legacySectionTarget(hash);
    if (target === null) return null;
    const ownQuery = new URLSearchParams(search).toString();
    const query = ownQuery === '' ? (lastQuery ?? '') : ownQuery;
    const path = subnavHref({ carriesQuery: true, href: target.route }, query);
    return {
        fragment: target.fragment,
        href: `${path}#${target.fragment}`,
        route: target.route,
    };
}

export function scrollPlan(
    target: LegacySection,
    mountedIds: ReadonlySet<string>,
    hasScrolled = false,
): FragmentScrollStep {
    if (hasScrolled) return FragmentScrollStep.NoOp;
    return mountedIds.has(target)
        ? FragmentScrollStep.ScrollTo
        : FragmentScrollStep.Pending;
}

export function watchLegacyFragmentScroll(
    fragment: LegacySection,
    route: string,
): () => void {
    let hasScrolled = false;
    const observer = new MutationObserver(() => attempt(false));
    const timer = window.setTimeout(
        () => attempt(true),
        SCROLL_WATCH_TIMEOUT_MS,
    );

    function stop() {
        observer.disconnect();
        window.clearTimeout(timer);
        for (const event of USER_SCROLL_EVENTS) {
            window.removeEventListener(event, stop);
        }
    }

    function attempt(hasTimedOut: boolean) {
        const section = document.querySelector<HTMLElement>(
            `#${CSS.escape(fragment)}`,
        );
        const isMounted =
            section !== null &&
            window.location.pathname === route &&
            (hasTimedOut || isSettled(section));
        const step = scrollPlan(
            fragment,
            new Set(isMounted ? [fragment] : []),
            hasScrolled,
        );
        if (step === FragmentScrollStep.ScrollTo) {
            hasScrolled = true;
            section?.scrollIntoView({ block: 'start' });
        }
        if (hasTimedOut || step !== FragmentScrollStep.Pending) stop();
    }

    for (const event of USER_SCROLL_EVENTS) {
        window.addEventListener(event, stop, { once: true, passive: true });
    }
    observer.observe(document.body, { childList: true, subtree: true });
    attempt(false);
    return stop;
}

function isSettled(section: HTMLElement): boolean {
    const scope = section.closest('main') ?? document.body;
    return [...scope.querySelectorAll(PENDING_PANEL_SELECTOR)].every(
        (pending) =>
            !section.contains(pending) &&
            (section.compareDocumentPosition(pending) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0,
    );
}
