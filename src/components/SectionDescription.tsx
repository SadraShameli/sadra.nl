import RevealAnimation from '~/components/ui/Animations/Reveal';
import { cn } from '~/lib/utilities';

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
            <p
                className={cn(
                    'mx-auto mt-4 text-center text-base lg:w-2/3 lg:text-lg',
                    className,
                )}
            >
                {text}
            </p>
        </RevealAnimation>
    );
}
