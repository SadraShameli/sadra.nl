import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '~/components/ui/Badge';
import { Card } from '~/components/ui/Card';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const quickLinks = [
    { href: routes.home, label: 'Home' },
    { href: routes.portfolio, label: 'Portfolio' },
    { href: routes.propCalculator.index, label: 'Prop firm calculator' },
    { href: routes.tradeChecklist.index, label: 'Trade checklist' },
    { href: routes.lifting.index, label: 'Lifting tracker' },
];

export default function NotFound() {
    return (
        <main className="relative flex min-h-[90svh] flex-1 items-center justify-center overflow-hidden px-6 py-16">
            <Card className="w-full max-w-xl items-center gap-0 px-8 py-12 text-center">
                <h1
                    aria-label="404"
                    className="font-serif text-[clamp(6rem,20vw,8rem)] leading-none font-medium tracking-tighter"
                >
                    404
                </h1>

                <h2 className="mt-18 text-xl font-semibold text-foreground">
                    This page slipped through the cracks.
                </h2>

                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                    The URL you&apos;re looking for doesn&apos;t exist, has been
                    moved, or was never here.
                </p>

                <div className="mt-10 flex max-w-md flex-wrap justify-center gap-1.5">
                    {quickLinks.map((link) => (
                        <Badge
                            asChild
                            className={cn(
                                'group gap-1 border-border bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:bg-foreground/5 hover:text-foreground',
                            )}
                            key={link.href}
                            variant="outline"
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
