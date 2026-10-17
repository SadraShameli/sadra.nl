import { type RefObject, useLayoutEffect } from 'react';

export function useSlidingIndicator<Key, Item extends HTMLElement>(
    indicatorReference: RefObject<HTMLSpanElement | null>,
    itemReferences: RefObject<Map<Key, Item>>,
    activeKey: Key | null | undefined,
): void {
    useLayoutEffect(() => {
        const indicator = indicatorReference.current;
        const container = indicator?.parentElement;
        if (
            indicator === null ||
            container === null ||
            container === undefined
        ) {
            return;
        }
        const place = () => {
            const target =
                activeKey === null || activeKey === undefined
                    ? undefined
                    : itemReferences.current.get(activeKey);
            const targetBox = target?.getBoundingClientRect();
            if (targetBox === undefined || targetBox.width === 0) {
                indicator.style.opacity = '0';
                return;
            }
            const containerBox = container.getBoundingClientRect();
            const left =
                targetBox.left - containerBox.left + container.scrollLeft;
            const top = targetBox.top - containerBox.top + container.scrollTop;
            indicator.style.opacity = '1';
            indicator.style.width = `${String(targetBox.width)}px`;
            indicator.style.height = `${String(targetBox.height)}px`;
            indicator.style.transform = `translate(${String(left)}px, ${String(top)}px)`;
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(container);
        return () => observer.disconnect();
    }, [activeKey, indicatorReference, itemReferences]);
}
