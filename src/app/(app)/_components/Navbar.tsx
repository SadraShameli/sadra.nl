'use client';

import { House } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';

import { ColorModeToggle } from '~/components/ColorModeToggle';
import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/site/content';
import { HOME_SECTIONS, homeSectionHref } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { CAPSULE_ICON_CLASS } from './capsuleStyles';
import {
    type ActiveHomeNavItem,
    HomeNavTarget,
    useActiveHomeNavItem,
} from './useActiveHomeNavItem';
import { useHeaderHeightVariable } from './useHeaderHeightVariable';

export default function Navbar({ accountLink }: { accountLink: ReactNode }) {
    const { socialLinks } = siteContent;
    const navReference = useRef<HTMLElement>(null);
    useHeaderHeightVariable(navReference);
    const { activeItem, pin } = useActiveHomeNavItem();
    const indicatorReference = useRef<HTMLSpanElement>(null);
    const itemReferences = useRef(
        new Map<ActiveHomeNavItem, HTMLAnchorElement>(),
    );
    useSlidingIndicator(indicatorReference, itemReferences, activeItem);
    const registerItem =
        (item: ActiveHomeNavItem) => (element: HTMLAnchorElement | null) => {
            if (element === null) itemReferences.current.delete(item);
            else itemReferences.current.set(item, element);
        };

    return (
        <header
            className={cn('app-shell__navbar', 'sticky inset-x-0 top-0 z-50')}
            ref={navReference}
        >
            <div className="@container flex justify-center px-4 pt-4.5 pb-3">
                <div className="flex w-full max-w-capsule flex-wrap items-center justify-center gap-1.5 rounded-4xl border glass p-2 @capsule:justify-between">
                    <nav
                        aria-label="Primary"
                        className="relative flex flex-wrap items-center justify-center gap-0.5"
                    >
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-0 left-0 rounded-full bg-surface-high opacity-0 transition-[transform,width,height,opacity] duration-300 ease-out motion-reduce:transition-none"
                            ref={indicatorReference}
                        />
                        <Link
                            aria-current={
                                activeItem === HomeNavTarget.Top
                                    ? 'location'
                                    : undefined
                            }
                            aria-label="Home"
                            className={cn(
                                'app-shell__home',
                                CAPSULE_ICON_CLASS,
                                'relative aria-[current=location]:text-ink',
                            )}
                            href={routes.home}
                            onClick={() => pin(HomeNavTarget.Top)}
                            ref={registerItem(HomeNavTarget.Top)}
                        >
                            <House aria-hidden strokeWidth={1.6} />
                        </Link>
                        {HOME_SECTIONS.map((section) => (
                            <Link
                                aria-current={
                                    activeItem === section.id
                                        ? 'location'
                                        : undefined
                                }
                                className="relative flex items-center rounded-full px-3.5 py-2.5 text-[15px] leading-[1.2] font-medium text-ink-nav focus-camel transition-colors hover:text-ink aria-[current=location]:text-ink"
                                href={homeSectionHref(section.id)}
                                key={section.id}
                                onClick={() => pin(section.id)}
                                ref={registerItem(section.id)}
                            >
                                {section.navLabel}
                            </Link>
                        ))}
                    </nav>

                    <CapsuleDivider />

                    <div className="flex items-center gap-1">
                        {socialLinks.map((profile) => (
                            <Link
                                aria-label={profile.title}
                                className={cn(
                                    'app-shell__social-link',
                                    CAPSULE_ICON_CLASS,
                                )}
                                href={profile.url}
                                key={profile.url}
                            >
                                <SocialIcon platform={profile.platform} />
                            </Link>
                        ))}
                        <ColorModeToggle
                            className={cn(
                                'app-shell__color-mode',
                                CAPSULE_ICON_CLASS,
                            )}
                        />
                        {accountLink}
                    </div>
                </div>
            </div>
            <div className={'app-shell__subnav-slot'} id="navbar-subnav-slot" />
        </header>
    );
}

function CapsuleDivider() {
    return <span aria-hidden className="mx-1.5 h-6 w-px bg-line" />;
}

function useSlidingIndicator(
    indicatorReference: RefObject<HTMLSpanElement | null>,
    itemReferences: RefObject<Map<ActiveHomeNavItem, HTMLAnchorElement>>,
    activeItem: ActiveHomeNavItem | null,
): void {
    useLayoutEffect(() => {
        const indicator = indicatorReference.current;
        if (indicator === null) return;
        const place = () => {
            const target =
                activeItem === null
                    ? undefined
                    : itemReferences.current.get(activeItem);
            if (target === undefined) {
                indicator.style.opacity = '0';
                return;
            }
            indicator.style.opacity = '1';
            indicator.style.width = `${String(target.offsetWidth)}px`;
            indicator.style.height = `${String(target.offsetHeight)}px`;
            indicator.style.transform = `translate(${String(target.offsetLeft)}px, ${String(target.offsetTop)}px)`;
        };
        place();
        const container = indicator.parentElement;
        if (container === null) return;
        const observer = new ResizeObserver(place);
        observer.observe(container);
        return () => observer.disconnect();
    }, [activeItem, indicatorReference, itemReferences]);
}
