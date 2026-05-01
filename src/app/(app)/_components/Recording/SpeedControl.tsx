import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';

import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './types';

interface SpeedControlProps {
    speed: PlaybackSpeed;
    hasRecordings: boolean;
    onSpeedChange: (speed: PlaybackSpeed) => void;
}

export function SpeedControl({
    speed,
    hasRecordings,
    onSpeedChange,
}: SpeedControlProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                disabled={!hasRecordings}
                className="w-8 text-center text-sm font-semibold text-neutral-400 tabular-nums transition hover:text-white disabled:cursor-not-allowed disabled:text-neutral-700"
                aria-label="Playback speed"
            >
                {speed}×
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                    value={String(speed)}
                    onValueChange={(v) =>
                        onSpeedChange(Number(v) as PlaybackSpeed)
                    }
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
