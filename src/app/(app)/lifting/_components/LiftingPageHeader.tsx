export function LiftingPageHeader({
    description,
    title,
}: {
    readonly description: string;
    readonly title: string;
}) {
    return (
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {description}
            </p>
        </header>
    );
}
