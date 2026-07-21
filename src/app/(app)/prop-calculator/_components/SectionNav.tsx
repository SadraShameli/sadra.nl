'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

interface Section {
    id: string;
    label: string;
}

export default function SectionNav() {
    const [sections, setSections] = useState<Section[]>([]);
    const [active, setActive] = useState('');
    const [slot, setSlot] = useState<Element | null>(null);
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });
    const navReference = useRef<HTMLDivElement>(null);
    const suppressReference = useRef(false);
    const suppressTimerReference = useRef<
        ReturnType<typeof setTimeout> | undefined
    >(undefined);
    const activeReference = useRef('');

    useEffect(() => {
        setSlot(document.querySelector('#navbar-subnav-slot'));
    }, []);

    useEffect(() => {
        const els = document.querySelectorAll<HTMLElement>(
            '[data-section-label]',
        );
        const discovered = [...els]
            .filter((element) => element.id)
            .map((element) => ({
                id: element.id,
                label: element.dataset.sectionLabel ?? '',
            }));
        setSections(discovered);
        if (discovered[0]) {
            setActive(discovered[0].id);
            activeReference.current = discovered[0].id;
        }

        const hash = window.location.hash.slice(1);
        if (hash && discovered.some((s) => s.id === hash)) {
            document
                .querySelector(`#${hash}`)
                ?.scrollIntoView({ behavior: 'smooth' });
            setActive(hash);
            activeReference.current = hash;
        }
    }, []);

    useEffect(() => {
        if (sections.length === 0) return;

        const [firstSection] = sections;
        if (!firstSection) return;
        const firstSectionId = firstSection.id;
        const intersectingIds = new Set<string>();

        function recomputeActive() {
            if (suppressReference.current) return;
            const current =
                sections
                    .map(({ id }) => id)
                    .findLast((id) => intersectingIds.has(id)) ??
                firstSectionId;
            if (current !== activeReference.current) {
                activeReference.current = current;
                history.replaceState(null, '', `#${current}`);
                setActive(current);
            }
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        intersectingIds.add(entry.target.id);
                    } else {
                        intersectingIds.delete(entry.target.id);
                    }
                }

                recomputeActive();
            },
            { rootMargin: '-35% 0px -65% 0px', threshold: 0 },
        );

        for (const { id } of sections) {
            const element = document.querySelector(`#${id}`);
            if (element) observer.observe(element);
        }

        return () => observer.disconnect();
    }, [sections]);

    useEffect(() => {
        const button = navReference.current?.querySelector<HTMLElement>(
            `[data-section="${CSS.escape(active)}"]`,
        );
        if (!button) return;
        button.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
        setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    }, [active]);

    function scrollTo(id: string) {
        suppressReference.current = true;
        activeReference.current = id;
        clearTimeout(suppressTimerReference.current);
        suppressTimerReference.current = setTimeout(() => {
            suppressReference.current = false;
        }, 800);
        document
            .querySelector(`#${id}`)
            ?.scrollIntoView({ behavior: 'smooth' });
        history.replaceState(null, '', `#${id}`);
        setActive(id);
    }

    if (!slot || sections.length === 0) return null;

    return createPortal(
        <div
            className={cn(
                'app-prop-calculator__section-nav',
                'relative container mx-auto flex overflow-x-auto',
            )}
            ref={navReference}
            style={{ scrollbarWidth: 'none' }}
        >
            {sections.map(({ id, label }) => (
                <Button
                    className={cn(
                        'app-prop-calculator__section-nav-btn',
                        'h-auto shrink-0 rounded-none px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-300',
                        active === id
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground/80',
                    )}
                    data-section={id}
                    key={id}
                    onClick={() => scrollTo(id)}
                    type="button"
                    variant="ghost"
                >
                    {label}
                </Button>
            ))}
            <span
                className="pointer-events-none absolute bottom-0 h-0.5 bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                style={{ left: indicator.left, width: indicator.width }}
            />
        </div>,
        slot,
    );
}
