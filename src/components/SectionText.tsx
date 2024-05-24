import RevealAnimation from '~/components/ui/Animations/Reveal';

interface SectionTitleProps {
  text: string;
}

export default function SectionText({ text }: SectionTitleProps) {
  return (
    <RevealAnimation>
      <h3 className="xl:text-7x mb-28 text-center text-4xl font-semibold text-white md:text-6xl">
        {text}
      </h3>
    </RevealAnimation>
  );
}
