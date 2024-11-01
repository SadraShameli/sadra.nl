import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
    text: string;
}

export default function SectionTitle({ text }: SectionTitleProps) {
    return (
        <RevealAnimation>
            <h2 className="mb-8 text-center text-4xl font-semibold text-white lg:text-6xl">{text}</h2>
        </RevealAnimation>
    );
}
