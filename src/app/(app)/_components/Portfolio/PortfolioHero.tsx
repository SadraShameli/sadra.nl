import { FileText, Mail, Send } from 'lucide-react';
import Link from 'next/link';

import { Button } from '~/components/ui/Button';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

type PortfolioHeroProperties = {
    canViewResume: boolean;
    email: string;
    headline: string;
    name: string;
    profiles: SocialProfile[];
};

type SocialProfile = {
    platform: string;
    title: string;
    url: string;
};

export default function PortfolioHero({
    canViewResume,
    email,
    headline,
    name,
}: PortfolioHeroProperties) {
    return (
        <header className={cn('app-portfolio__hero')}>
            <h1
                className={cn(
                    'app-portfolio__hero-name',
                    'font-orbitron text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-white sm:text-[2.75rem] lg:text-[3rem]',
                )}
            >
                Portfolio
            </h1>

            <p
                className={cn(
                    'app-portfolio__hero-headline',
                    'mt-5 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg',
                )}
            >
                {headline}
            </p>

            <div
                className={cn(
                    'app-portfolio__hero-actions',
                    'mt-8 flex flex-wrap items-center gap-x-2 gap-y-3',
                )}
            >
                <Button
                    asChild
                    className="h-auto min-h-11 gap-2 rounded-full"
                    variant="outline"
                >
                    <Link href={routes.contact}>
                        <Send aria-hidden="true" className="size-4" />
                        <span>Contact</span>
                    </Link>
                </Button>

                {canViewResume && (
                    <Button
                        asChild
                        className="h-auto min-h-11 gap-2 rounded-full"
                        variant="outline"
                    >
                        <Link href={routes.resume.index}>
                            <FileText aria-hidden="true" className="size-4" />
                            <span>Resume</span>
                        </Link>
                    </Button>
                )}

                <Button
                    asChild
                    className="size-11 rounded-full"
                    size="icon"
                    variant="outline"
                >
                    <Link aria-label={`Email ${name}`} href={`mailto:${email}`}>
                        <Mail aria-hidden="true" className="size-4" />
                    </Link>
                </Button>
            </div>
        </header>
    );
}
