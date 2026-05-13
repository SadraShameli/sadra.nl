import '~/styles/styles.css';

import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import { orbitron } from '~/fonts';
import { cn } from '~/lib/utils';

export const metadata: Metadata = {
    title: 'sadra.nl',
    icons: { icon: '/favicon.ico' },
};

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark antialiased">
            <body
                className={cn(
                    orbitron.variable,
                    GeistSans.variable,
                    'bg-background text-foreground',
                )}
            >
                {children}
            </body>
        </html>
    );
}
