import { type Metadata } from 'next';

export const metadata: Metadata = {
    robots: { follow: true, index: false },
};

export default function AuthLayout({ children }: LayoutProps<'/'>) {
    return children;
}
