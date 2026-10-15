export const ensureStatic = 'prefetch';

export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
    return (
        <main className="container mx-auto max-w-3xl px-6 py-16 text-sm/relaxed">
            <div className="prose prose-sm max-w-none prose-invert">
                {children}
            </div>
        </main>
    );
}
