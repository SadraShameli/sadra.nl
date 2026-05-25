import { type ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
    return (
        <main className="container mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed">
            <div className="prose prose-sm max-w-none prose-invert">
                {children}
            </div>
        </main>
    );
}
