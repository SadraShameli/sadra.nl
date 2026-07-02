import RevealAnimation from '~/components/ui/Animations/Reveal';
import { cn } from '~/lib/utils';

interface SectionTitleProperties {
    className?: string;
    text: string;
}

export default function SectionDescription({
    className,
    text,
}: SectionTitleProperties) {
    return (
        <RevealAnimation>
            <p className={cn('mx-auto mt-4 text-center lg:w-2/3', className)}>
                {text}
            </p>
        </RevealAnimation>
    );
}
