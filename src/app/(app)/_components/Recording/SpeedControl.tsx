import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import { cn } from '~/lib/utils';

import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './types';

interface SpeedControlProps {
    hasRecordings: boolean;
    onSpeedChange: (speed: PlaybackSpeed) => void;
    speed: PlaybackSpeed;
}

export function SpeedControl({
    hasRecordings,
    onSpeedChange,
    speed,
}: SpeedControlProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Playback speed"
                className={cn(
                    'app-recording__speed',
                    'w-8 text-center text-sm font-semibold text-neutral-400 tabular-nums transition hover:text-white disabled:cursor-not-allowed disabled:text-neutral-700',
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
