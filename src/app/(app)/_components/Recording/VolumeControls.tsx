import { ListEnd, Volume, Volume1, Volume2 } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { Slider } from '~/components/ui/Slider';
import { cn } from '~/lib/utils';

import { SpeedControl } from './SpeedControl';
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
                'flex items-center justify-between gap-x-3 text-neutral-400',
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
                    className={cn(
                        'app-recording__autoplay size-8 rounded-full p-0 text-neutral-400 transition hover:bg-white/5 hover:text-foreground',
                        isAutoPlay && 'text-foreground',
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
                    className="app-recording__mute size-8 rounded-full p-0 text-neutral-400 transition hover:bg-white/5 hover:text-foreground"
                    data-state={volume === 0 ? 'muted' : 'on'}
                    disabled={!hasRecordings}
                    onClick={onMute}
                    type="button"
                    variant="ghost"
                >
                    {volume === 0 ? (
                        <Volume className="size-4 text-foreground" />
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
