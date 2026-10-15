export function LiftingDetailHeader({
    description,
    eyebrow,
    title,
}: {
    readonly description: null | string;
    readonly eyebrow: string;
    readonly title: string;
}) {
    return (
        <header>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {eyebrow}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {title}
            </h1>
            {description && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    {description}
                </p>
            )}
        </header>
    );
}
