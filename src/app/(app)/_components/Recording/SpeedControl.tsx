import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import { cn } from '~/lib/utils';

import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './types';

interface SpeedControlProperties {
    hasRecordings: boolean;
    onSpeedChange: (speed: PlaybackSpeed) => void;
    speed: PlaybackSpeed;
}

export function SpeedControl({
    hasRecordings,
    onSpeedChange,
    speed,
}: SpeedControlProperties) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Playback speed"
                className={cn(
                    'app-recording__speed',
                    'inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-neutral-300 tabular-nums transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
                )}
                disabled={!hasRecordings}
            >
                {speed}×
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                    onValueChange={(v) =>
                        onSpeedChange(Number(v) as PlaybackSpeed)
                    }
                    value={String(speed)}
                >
                    {PLAYBACK_SPEEDS.map((s) => (
                        <DropdownMenuRadioItem key={s} value={String(s)}>
                            {s}×
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
