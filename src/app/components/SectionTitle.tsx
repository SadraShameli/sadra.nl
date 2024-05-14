import RevealAnimation from '~/components/Animations/Reveal';

interface SectionTitleProps {
    text: string;
}

export default function SectionTitle({ text }: SectionTitleProps) {
    return (
        <RevealAnimation>
            <h2 className='xl:text-7x pb-16 text-center text-4xl font-semibold text-white md:text-6xl'>{text}</h2>
        </RevealAnimation>
    );
}
