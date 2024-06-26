import RevealAnimation from '~/components/ui/Animations/Reveal';
import Card from '~/components/ui/Card';

import GallerySection from './GallerySection';

// import Image from 'next/image';
// import ProfilePicture from '~/assets/images/sadra.jpg';
// import StaggerAnimation from '~/components/ui/Animations/Stagger';
// import Resume from '~/data/Resume';

export default function AboutSection() {
  return (
    <RevealAnimation>
      <Card>
        <div className="grid gap-y-12">
          <GallerySection />
          {/* <StaggerAnimation className="grid gap-x-20 gap-y-12 md:grid-cols-2">
                        <div className="flex h-full items-center gap-x-5">
                            <Image
                                className="hidden size-16 rounded-lg sm:inline"
                                src={ProfilePicture}
                                alt={'Profile picture'}
                            />
                            <h2 className="border-l text-justify sm:pl-6">
                                {Resume.basics.summary}
                            </h2>
                        </div>
                        <iframe
                            className="rounded-2xl"
                            src="https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0"
                            width="100%"
                            height="152"
                            allowFullScreen={true}
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            loading="lazy"
                        />
                    </StaggerAnimation> */}
          <iframe
            className="rounded-2xl md:mx-auto lg:w-1/2"
            src="https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0"
            width="100%"
            height="152"
            allowFullScreen={true}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      </Card>
    </RevealAnimation>
  );
}
