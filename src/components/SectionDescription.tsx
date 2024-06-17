import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
  text: string;
}

export default function SectionDescription({ text }: SectionTitleProps) {
  return (
    <RevealAnimation>
      <h2 className="xl:text-3x mb-10 text-center text-lg md:mb-28 md:text-xl">
        {text}
      </h2>
    </RevealAnimation>
  );
}
