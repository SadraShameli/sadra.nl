import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import '~/styles/globals.css';
import { orbitron } from '~/data/Fonts';
import ResumeSadra from '~/data/Resume/Sadra';
import { TRPCReactProvider } from '~/trpc/react';

export const metadata: Metadata = {
  title: ResumeSadra.title,
  description: ResumeSadra.description,
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth antialiased">
      <meta name="theme-color" content="#000" />
      <body className={`${orbitron.variable} ${GeistSans.className}`}>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
