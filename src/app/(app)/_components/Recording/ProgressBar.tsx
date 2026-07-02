import { Slider } from '~/components/ui/Slider';
import { DurationFormat } from '~/lib/lifting/format';
import { cn } from '~/lib/utils';

interface ProgressBarProperties {
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
}: ProgressBarProperties) {
    return (
        <div className={cn('app-recording__progress', 'flex flex-col gap-1.5')}>
            <Slider
                className={cn('app-recording__progress-slider', 'w-full')}
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

            <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400 tabular-nums">
                <span>{DurationFormat.seconds(time)}</span>
                <span>{DurationFormat.seconds(duration)}</span>
            </div>
        </div>
    );
}
