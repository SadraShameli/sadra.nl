import { type Metadata } from 'next';

import { CapsulePage } from '~/components/CapsulePage';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { Card } from '~/components/ui/card';
import { siteContent } from '~/lib/site/content';
import { buildPublicPageMetadata } from '~/lib/site/metadata';
import { routes } from '~/lib/site/routes';

import { ContactForm } from './ContactForm';

export const metadata: Metadata = buildPublicPageMetadata({
    canonical: routes.contact,
    description: `Contact ${siteContent.manifest.name} about daytrading, trading tools, development projects or a collaboration.`,
    title: 'Contact',
});

export const ensureStatic = 'prefetch';

export default function ContactPage() {
    return (
        <PageTransition>
            <CapsulePage>
                <PageHeader
                    eyebrow="Contact"
                    lead="Drop a line for collaborations, questions or just a hello."
                    title="Get in touch"
                />
                <Card className="p-6">
                    <ContactForm />
                </Card>
            </CapsulePage>
        </PageTransition>
    );
}
