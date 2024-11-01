import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
    text: string;
}

export default function SectionDescription({ text }: SectionTitleProps) {
    return (
        <RevealAnimation>
            <p className="mx-auto mt-4 text-center lg:w-2/3">{text}</p>
        </RevealAnimation>
    );
}
