import { type Metadata } from 'next';

import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
    description: 'Get in touch with Sadra.',
    title: 'Contact',
};

export default function ContactPage() {
    return (
        <main className="container mx-auto max-w-xl px-6 py-16">
            <h1 className="mb-3 text-3xl font-semibold">Get in touch</h1>
            <p className="mb-8 text-sm text-muted-foreground">
                Drop a line — for collaborations, questions or just a hello.
            </p>
            <ContactForm />
        </main>
    );
}
