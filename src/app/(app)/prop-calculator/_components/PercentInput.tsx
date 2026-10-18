import { Input } from '~/components/ui/input';

interface PercentInputProperties {
    id: string;
    isDisabled?: boolean;
    onChange: (percent: number) => void;
    value: number;
}

export function PercentInput({
    id,
    isDisabled = false,
    onChange,
    value,
}: PercentInputProperties) {
    return (
        <div className="relative flex-1">
            <Input
                className="pr-7"
                disabled={isDisabled}
                id={id}
                max={100}
                min={0}
                onChange={(event) => onChange(Number(event.target.value))}
                step={1}
                type="number"
                value={value || ''}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                %
            </span>
        </div>
    );
}
