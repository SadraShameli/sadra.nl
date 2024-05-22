import Image from 'next/image';

import Porsche from '~/assets/images/gallery/porsche.jpg';
import Setup from '~/assets/images/gallery/setup.jpg';
import SpainChurch from '~/assets/images/gallery/spain-church.jpg';
import SpainPool from '~/assets/images/gallery/spain-pool.jpg';
import StaggerAnimation from '~/components/ui/Animations/Stagger';

export default function GallerySection() {
    return (
        <div className="px-4 py-6 md:px-12 lg:py-28">
            <StaggerAnimation className="grid grid-cols-2 lg:grid-cols-4">
                <Image
                    className="size-full origin-bottom rotate-6 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:z-50 hover:-translate-y-12 hover:rotate-0 hover:scale-125"
                    src={SpainChurch}
                    alt=""
                />
                <Image
                    className="size-full origin-bottom -rotate-12 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-12 hover:rotate-0 hover:scale-125"
                    src={SpainPool}
                    alt=""
                />
                <Image
                    className="size-full origin-bottom rotate-6 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-12 hover:rotate-0 hover:scale-125"
                    src={Porsche}
                    alt=""
                />
                <Image
                    className="size-full origin-bottom -rotate-12 transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:-translate-y-12 hover:rotate-0 hover:scale-125"
                    src={Setup}
                    alt=""
                />
            </StaggerAnimation>
        </div>
    );
}
