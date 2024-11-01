import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
    text: string;
}

export default function SectionDescription({ text }: SectionTitleProps) {
    return (
        <RevealAnimation>
            <p className="mx-auto mb-10 max-w-lg text-center text-lg lg:mb-28">{text}</p>
        </RevealAnimation>
    );
}
