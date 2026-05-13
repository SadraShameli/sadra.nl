'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '~/lib/utils';

interface Section {
    id: string;
    label: string;
}

export default function SectionNav() {
    const [sections, setSections] = useState<Section[]>([]);
    const [active, setActive] = useState('');
    const [slot, setSlot] = useState<Element | null>(null);
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });
    const navRef = useRef<HTMLDivElement>(null);
    const suppressRef = useRef(false);
    const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const activeRef = useRef('');

    useEffect(() => {
        setSlot(document.querySelector('#navbar-subnav-slot'));
    }, []);

    useEffect(() => {
        const els = document.querySelectorAll<HTMLElement>(
            '[data-section-label]',
        );
        const discovered = [...els]
            .filter((el) => el.id)
            .map((el) => ({ id: el.id, label: el.dataset.sectionLabel ?? '' }));
        setSections(discovered);
        if (discovered[0]) {
            setActive(discovered[0].id);
            activeRef.current = discovered[0].id;
        }

        const hash = window.location.hash.slice(1);
        if (hash && discovered.some((s) => s.id === hash)) {
            document
                .querySelector(`#${hash}`)
                ?.scrollIntoView({ behavior: 'smooth' });
            setActive(hash);
            activeRef.current = hash;
        }
    }, []);

    useEffect(() => {
        if (sections.length === 0) return;

        function update() {
            if (suppressRef.current) return;
            const [firstSection] = sections;
            if (!firstSection) return;
            const threshold = window.innerHeight * 0.35;
            let current = firstSection.id;
            for (const { id } of sections) {
                const el = document.querySelector(`#${id}`);
                if (!el) continue;
                if (el.getBoundingClientRect().top <= threshold) {
                    current = id;
                }
            }
            if (current !== activeRef.current) {
                activeRef.current = current;
                history.replaceState(null, '', `#${current}`);
                setActive(current);
            }
        }

        window.addEventListener('scroll', update, { passive: true });
        update();
        return () => window.removeEventListener('scroll', update);
    }, [sections]);

    useEffect(() => {
        const btn = navRef.current?.querySelector<HTMLElement>(
            `[data-section="${active}"]`,
        );
        if (!btn) return;
        btn.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }, [active]);

    function scrollTo(id: string) {
        suppressRef.current = true;
        activeRef.current = id;
        clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = setTimeout(() => {
            suppressRef.current = false;
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
            className="relative container mx-auto flex overflow-x-auto"
            ref={navRef}
            style={{ scrollbarWidth: 'none' }}
        >
            {sections.map(({ id, label }) => (
                <button
                    className={cn(
                        'relative shrink-0 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                        active === id
                            ? 'text-white'
                            : 'text-white/40 hover:text-white/70',
                    )}
                    data-section={id}
                    key={id}
                    onClick={() => scrollTo(id)}
                >
                    {label}
                </button>
            ))}
            <span
                className="pointer-events-none absolute bottom-0 h-0.5 bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                style={{ left: indicator.left, width: indicator.width }}
            />
        </div>,
        slot,
    );
}
