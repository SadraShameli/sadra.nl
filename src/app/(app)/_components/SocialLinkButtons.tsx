import Link from 'next/link';

import { Button } from '~/components/ui/button';
import { SocialIcon } from '~/components/ui/social-icon';
import { siteContent } from '~/lib/site/content';

export function SocialLinkButtons({
    className,
}: {
    readonly className?: string;
}) {
    return siteContent.socialLinks.map((profile) => (
        <Button
            asChild
            className={className}
            key={profile.url}
            size="icon-tap"
            variant="capsule"
        >
            <Link
                aria-label={profile.title}
                href={profile.url}
                rel="noreferrer"
                target="_blank"
            >
                <SocialIcon platform={profile.platform} />
            </Link>
        </Button>
    ));
}
