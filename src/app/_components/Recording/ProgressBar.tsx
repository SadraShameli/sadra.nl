import { Slider } from '~/components/ui/Slider';
import { ConvertSecondsToString } from './helpers';

interface ProgressBarProps {
    time: number;
    duration: number;
    hasRecordings: boolean;
    onTimeChange: (time: number) => void;
}

export function ProgressBar({
    time,
    duration,
    hasRecordings,
    onTimeChange,
}: ProgressBarProps) {
    return (
        <div className="col-span-2 mt-5 grid grid-cols-6 items-center gap-x-3 leading-none font-semibold">
            <span className="col-span-1 text-right text-sm">
                {ConvertSecondsToString(time)}
            </span>

            <Slider
                className="col-span-4 h-1/3"
                defaultValue={[0]}
                min={0}
                max={duration + 0.01}
                value={[time]}
                onValueChange={(values: number[]) => {
                    if (values[0] !== undefined) {
                        onTimeChange(values[0]);
                    }
                }}
                disabled={!hasRecordings}
            />

            <span className="col-span-1 text-sm">
                {ConvertSecondsToString(duration)}
            </span>
        </div>
    );
}
