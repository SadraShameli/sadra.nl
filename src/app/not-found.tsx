import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '~/components/PageHeader';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import { siteTools } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const quickLinks = [
    { href: routes.home, label: 'Home' },
    ...siteTools.map((tool) => ({ href: tool.href, label: tool.title })),
];

export default function NotFound() {
    return (
        <main className="relative flex min-h-[90svh] flex-1 items-center justify-center overflow-hidden px-6 py-16">
            <Card className="w-full max-w-xl items-center gap-0 px-8 py-12 text-center">
                <p className="m-0 font-serif text-[clamp(6rem,20vw,8rem)] leading-none font-medium tracking-tighter">
                    404
                </p>

                <PageHeader
                    className="mt-18 mb-0 justify-center"
                    lead="The URL you're looking for doesn't exist, has been moved, or was never here."
                    title="This page slipped through the cracks."
                />

                <div className="mt-10 flex max-w-md flex-wrap justify-center gap-1.5">
                    {quickLinks.map((link) => (
                        <Badge
                            asChild
                            className={cn(
                                'group gap-1 border-border bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:bg-foreground/5 hover:text-foreground',
                            )}
                            key={link.href}
                        >
                            <Link href={link.href}>
                                <span>{link.label}</span>
                                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                            </Link>
                        </Badge>
                    ))}
                </div>
            </Card>
        </main>
    );
}
