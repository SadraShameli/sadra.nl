import { Slider } from '~/components/ui/Slider';
import { cn } from '~/lib/utils';

import { ConvertSecondsToString } from './helpers';

interface ProgressBarProps {
    duration: number;
    hasRecordings: boolean;
    onTimeChange: (time: number) => void;
    time: number;
}

export function ProgressBar({
    duration,
    hasRecordings,
    onTimeChange,
    time,
}: ProgressBarProps) {
    return (
        <div
            className={cn(
                'app-recording__progress',
                'col-span-2 mt-5 grid grid-cols-6 items-center gap-x-3 leading-none font-semibold',
            )}
        >
            <span className="col-span-1 text-right text-sm">
                {ConvertSecondsToString(time)}
            </span>

            <Slider
                className={cn(
                    'app-recording__progress-slider',
                    'col-span-4 h-1/3',
                )}
                defaultValue={[0]}
                disabled={!hasRecordings}
                max={duration + 0.01}
                min={0}
                onValueChange={(values: number[]) => {
                    if (values[0] !== undefined) {
                        onTimeChange(values[0]);
                    }
                }}
                value={[time]}
            />

            <span className="col-span-1 text-sm">
                {ConvertSecondsToString(duration)}
            </span>
        </div>
    );
}
