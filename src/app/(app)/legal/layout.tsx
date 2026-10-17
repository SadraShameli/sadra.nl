export const ensureStatic = 'prefetch';

export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
    return (
        <main className="px-4 py-16 text-sm/relaxed">
            <div className="mx-auto prose prose-sm max-w-capsule prose-theme">
                {children}
            </div>
        </main>
    );
}
