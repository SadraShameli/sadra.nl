import { type Metadata } from 'next';

import { CapsulePage } from '~/app/(app)/_components/CapsulePage';
import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
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
            <CapsulePage>
                <ToolPageHeader
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
