import Image from 'next/image';

import Porsche from '~/assets/images/gallery/porsche.jpg';
import Setup from '~/assets/images/gallery/setup.jpg';
import SpainChurch from '~/assets/images/gallery/spain-church.jpg';
import SpainPool from '~/assets/images/gallery/spain-pool.jpg';
import StaggerAnimation from '~/components/ui/Animations/Stagger';

export default function GallerySection() {
    return (
        <div className="px-4 py-6 pt-spacing-inner lg:mt-0 lg:px-10 lg:py-20">
            <StaggerAnimation className="grid grid-cols-2 lg:grid-cols-4">
                <Image
                    className="size-full origin-bottom rotate-6 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:z-50 hover:-translate-y-6 hover:rotate-0 hover:scale-105 lg:hover:-translate-y-12"
                    src={SpainChurch}
                    alt=""
                />

                <Image
                    className="size-full origin-bottom -rotate-12 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-6 hover:rotate-0 hover:scale-105 lg:hover:-translate-y-12"
                    src={SpainPool}
                    alt=""
                />

                <Image
                    className="size-full origin-bottom rotate-6 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-6 hover:rotate-0 hover:scale-105 lg:hover:-translate-y-12"
                    src={Porsche}
                    alt=""
                />

                <Image
                    className="size-full origin-bottom -rotate-12 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-6 hover:rotate-0 hover:scale-105 lg:hover:-translate-y-12"
                    src={Setup}
                    alt=""
                />
            </StaggerAnimation>
        </div>
    );
}
