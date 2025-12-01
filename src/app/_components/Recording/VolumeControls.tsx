import { ListEnd, Volume, Volume1, Volume2 } from 'lucide-react';
import { Slider } from '~/components/ui/Slider';
import { cn } from '~/lib/utils';

interface VolumeControlsProps {
    volume: number;
    isAutoPlay: boolean;
    hasRecordings: boolean;
    onMute: () => void;
    onVolumeChange: (volume: number) => void;
    onAutoPlay: () => void;
}

export function VolumeControls({
    volume,
    isAutoPlay,
    hasRecordings,
    onMute,
    onVolumeChange,
    onAutoPlay,
}: VolumeControlsProps) {
    return (
        <div className="mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end">
            <button
                className={cn(
                    'size-6 transition hover:text-white disabled:text-neutral-700',
                    isAutoPlay && 'text-white',
                )}
                onClick={onAutoPlay}
                disabled={!hasRecordings}
                aria-label="Auto Play"
            >
                <ListEnd />
            </button>

            <button
                className="size-6 transition hover:text-white disabled:text-neutral-700"
                onClick={onMute}
                disabled={!hasRecordings}
                aria-label="Volume"
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
                className="h-2 w-2/5"
                defaultValue={[1]}
                value={[volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(values: number[]) => {
                    if (values[0] !== undefined) {
                        onVolumeChange(values[0]);
                    }
                }}
                disabled={!hasRecordings}
            />
        </div>
    );
}
