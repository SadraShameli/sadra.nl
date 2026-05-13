import '~/styles/styles.css';

import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import { orbitron } from '~/fonts';
import { cn } from '~/lib/utils';

export const metadata: Metadata = {
    icons: { icon: '/favicon.ico' },
    title: 'sadra.nl',
};

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html className="dark antialiased" lang="en">
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
