import { ListEnd, Volume, Volume1, Volume2 } from 'lucide-react';

import { Slider } from '~/components/ui/Slider';
import { cn } from '~/lib/utils';

import { SpeedControl } from './SpeedControl';
import { type PlaybackSpeed } from './types';

interface VolumeControlsProps {
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
}: VolumeControlsProps) {
    return (
        <div
            className={cn(
                'app-recording__volume-controls',
                'flex items-center justify-end gap-x-3 text-neutral-400',
            )}
        >
            <SpeedControl
                hasRecordings={hasRecordings}
                onSpeedChange={onSpeedChange}
                speed={playbackRate}
            />

            <button
                aria-label="Auto Play"
                className={cn(
                    'app-recording__autoplay',
                    'size-6 transition hover:text-white disabled:text-neutral-700',
                    isAutoPlay && 'text-white',
                )}
                data-state={isAutoPlay ? 'on' : 'off'}
                disabled={!hasRecordings}
                onClick={onAutoPlay}
            >
                <ListEnd />
            </button>

            <button
                aria-label="Volume"
                className={cn(
                    'app-recording__mute',
                    'size-6 transition hover:text-white disabled:text-neutral-700',
                )}
                data-state={volume === 0 ? 'muted' : 'on'}
                disabled={!hasRecordings}
                onClick={onMute}
            >
                {volume === 0 ? (
                    <Volume className="text-white" />
                ) : volume >= 0.6 ? (
                    <Volume2 />
                ) : (
                    <Volume1 />
                )}
            </button>

            <Slider
                className={cn('app-recording__volume-slider', 'h-2 w-1/5')}
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
    );
}
