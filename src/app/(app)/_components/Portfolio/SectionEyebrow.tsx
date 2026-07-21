import Eyebrow from '~/components/Eyebrow';
import { cn } from '~/lib/utilities';

type SectionEyebrowProperties = {
    className?: string;
    count?: number;
    label: string;
};

export default function SectionEyebrow({
    className,
    count,
    label,
}: SectionEyebrowProperties) {
    const formattedCount =
        typeof count === 'number' ? count.toString().padStart(2, '0') : null;

    return (
        <Eyebrow
            className={cn(
                'app-portfolio__eyebrow',
                'flex items-center gap-x-2',
                className,
            )}
        >
            <span>{label}</span>
            {formattedCount ? (
                <>
                    <span aria-hidden="true" className="text-neutral-600">
                        ·
                    </span>
                    <span className="text-neutral-500 tabular-nums">
                        {formattedCount}
                    </span>
                </>
            ) : null}
        </Eyebrow>
    );
}
