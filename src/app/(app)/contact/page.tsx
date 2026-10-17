import { type Metadata } from 'next';

import { PageTransition } from '~/components/PageTransition';
import { Card } from '~/components/ui/Card';

import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
    description: 'Get in touch with Sadra.',
    title: 'Contact',
};

export const ensureStatic = 'prefetch';

export default function ContactPage() {
    return (
        <PageTransition>
            <main className="px-4 py-16">
                <div className="mx-auto w-full max-w-capsule">
                    <h1 className="mb-3 text-3xl font-semibold">
                        Get in touch
                    </h1>
                    <p className="mb-8 text-sm text-muted-foreground">
                        Drop a line for collaborations, questions or just a
                        hello.
                    </p>
                    <Card className="p-6">
                        <ContactForm />
                    </Card>
                </div>
            </main>
        </PageTransition>
    );
}
