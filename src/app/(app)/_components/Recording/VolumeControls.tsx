import { ListEnd, Volume, Volume1, Volume2 } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Slider } from '~/components/ui/slider';
import { cn } from '~/lib/utilities';

import { SpeedControl } from './SpeedControl';
import { RECORDER_TOGGLE_ON_CLASS } from './toggleStyles';
import { type PlaybackSpeed } from './types';

interface VolumeControlsProperties {
    hasRecordings: boolean;
    isAutoPlay: boolean;
    onAutoPlay: () => void;
    onMute: () => void;
    onSpeedChange: (speed: PlaybackSpeed) => void;
    onVolumeChange: (volume: number) => void;
    playbackRate: PlaybackSpeed;
    volume: number;
}

export function VolumeControls({
    hasRecordings,
    isAutoPlay,
    onAutoPlay,
    onMute,
    onSpeedChange,
    onVolumeChange,
    playbackRate,
    volume,
}: VolumeControlsProperties) {
    return (
        <div
            className={cn(
                'app-recording__volume-controls',
                'flex items-center justify-between gap-x-3 text-muted-foreground',
            )}
        >
            <SpeedControl
                hasRecordings={hasRecordings}
                onSpeedChange={onSpeedChange}
                speed={playbackRate}
            />

            <div className="flex flex-1 items-center justify-end gap-x-2">
                <Button
                    aria-label="Auto Play"
                    aria-pressed={isAutoPlay}
                    className={cn(
                        'app-recording__autoplay size-11 p-0 text-ink-muted hover:bg-surface-high hover:text-ink',
                        isAutoPlay && RECORDER_TOGGLE_ON_CLASS,
                    )}
                    data-state={isAutoPlay ? 'on' : 'off'}
                    disabled={!hasRecordings}
                    onClick={onAutoPlay}
                    type="button"
                    variant="ghost"
                >
                    <ListEnd className="size-4" />
                </Button>

                <Button
                    aria-label="Volume"
                    className="app-recording__mute size-11 p-0 text-ink-muted hover:bg-surface-high hover:text-ink"
                    data-state={volume === 0 ? 'muted' : 'on'}
                    disabled={!hasRecordings}
                    onClick={onMute}
                    type="button"
                    variant="ghost"
                >
                    {volume === 0 ? (
                        <Volume className="size-4 text-ink" />
                    ) : volume >= 0.6 ? (
                        <Volume2 className="size-4" />
                    ) : (
                        <Volume1 className="size-4" />
                    )}
                </Button>

                <Slider
                    className={cn(
                        'app-recording__volume-slider',
                        'w-24 sm:w-28',
                    )}
                    defaultValue={[1]}
                    disabled={!hasRecordings}
                    max={1}
                    min={0}
                    onValueChange={(values: number[]) => {
                        if (values[0] !== undefined) {
                            onVolumeChange(values[0]);
                        }
                    }}
                    step={0.01}
                    value={[volume]}
                />
            </div>
        </div>
    );
}
