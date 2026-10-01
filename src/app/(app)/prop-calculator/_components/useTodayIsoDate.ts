'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { MS_PER_DAY, todayIsoDate } from '~/lib/prop-accounts';

export function useFollowToday({
    isEnabled,
    read,
    today,
    write,
}: {
    readonly isEnabled: boolean;
    readonly read: () => string;
    readonly today: string;
    readonly write: (day: string) => void;
}) {
    const seededDay = useRef(today);
    const follow = useEffectEvent((day: string) => {
        const previous = seededDay.current;
        seededDay.current = day;
        if (isEnabled && read() === previous) write(day);
    });
    useEffect(() => {
        if (seededDay.current !== today) follow(today);
    }, [today]);
}

export function useTodayIsoDate(): string {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const untilMidnightMs = MS_PER_DAY - (nowMs % MS_PER_DAY);
        const timer = setTimeout(() => {
            setNowMs(Date.now());
        }, untilMidnightMs);
        return () => {
            clearTimeout(timer);
        };
    }, [nowMs]);
    useEffect(() => {
        const resync = () => {
            if (document.visibilityState === 'hidden') return;
            const current = Date.now();
            setNowMs((previous) =>
                Math.floor(current / MS_PER_DAY) ===
                Math.floor(previous / MS_PER_DAY)
                    ? previous
                    : current,
            );
        };
        document.addEventListener('visibilitychange', resync);
        window.addEventListener('focus', resync);
        return () => {
            document.removeEventListener('visibilitychange', resync);
            window.removeEventListener('focus', resync);
        };
    }, []);
    return todayIsoDate(new Date(nowMs));
}
