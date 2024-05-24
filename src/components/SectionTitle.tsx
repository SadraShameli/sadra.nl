import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
  text: string;
}

export default function SectionTitle({ text }: SectionTitleProps) {
  return (
    <RevealAnimation>
      <h1 className="xl:text-7x mb-8 text-center text-4xl font-semibold text-white md:text-6xl">
        {text}
      </h1>
    </RevealAnimation>
  );
}
