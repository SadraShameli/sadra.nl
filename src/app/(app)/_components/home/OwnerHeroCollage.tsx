import { DEFAULT_HERO_SHOWCASE, HeroShowcase } from '~/lib/site/HeroShowcase';
import { readOwnerHeroShowcase } from '~/server/site/HeroShowcaseReads';

import { HeroCollage } from './HeroCollage';

const DEFAULT_VIEW = HeroShowcase.fromInput(DEFAULT_HERO_SHOWCASE).toView();

export async function OwnerHeroCollage() {
    const figures = await readOwnerHeroShowcase();
    return (
        <HeroCollage
            showcase={
                figures === null
                    ? DEFAULT_VIEW
                    : new HeroShowcase(figures).toView()
            }
        />
    );
}

export function PlaceholderHeroCollage() {
    return <HeroCollage showcase={DEFAULT_VIEW} />;
}
