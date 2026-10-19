import { type Metadata } from 'next';
import Link from 'next/link';

import { LegalSection } from '~/app/(app)/legal/_components/LegalSection';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { formatDisplayDate } from '~/lib/format';
import { buildPublicPageMetadata } from '~/lib/site/metadata';
import { routes } from '~/lib/site/routes';
import { SITE_NAME } from '~/lib/site/siteName';

export const metadata: Metadata = buildPublicPageMetadata({
    canonical: routes.legal.privacy,
    description: `How ${SITE_NAME} handles personal data.`,
    title: 'Privacy policy',
});

export default function PrivacyPage() {
    const updated = '2026-05-20';
    return (
        <PageTransition>
            <article>
                <PageHeader
                    className="not-prose"
                    lead={`Last updated: ${formatDisplayDate(updated)}`}
                    title="Privacy policy"
                />

                <LegalSection title="What we collect">
                    <ul>
                        <li>
                            <strong>Account data:</strong> email address,
                            display name, and a hashed password if you sign up
                            with credentials.
                        </li>
                        <li>
                            <strong>Session data:</strong> an opaque session
                            token, your IP address and user-agent, used to keep
                            you signed in and to let you see and revoke your
                            active sessions.
                        </li>
                        <li>
                            <strong>Trading journal:</strong> the trade plans,
                            assessments and pre-market checklists you create.
                        </li>
                        <li>
                            <strong>Sensor Hub:</strong> IoT devices linked to
                            your account submit sensor readings and audio
                            recordings.
                        </li>
                        <li>
                            <strong>Analytics:</strong> aggregated, anonymous
                            page-view and performance metrics via Vercel
                            Analytics and Speed Insights.
                        </li>
                    </ul>
                </LegalSection>

                <LegalSection title="What we don't collect">
                    <p>
                        No cross-site advertising trackers. No fingerprinting.
                        No sale of personal data.
                    </p>
                </LegalSection>

                <LegalSection title="Your rights (GDPR)">
                    <p>
                        You can request a copy of your data or its deletion at
                        any time by emailing the address on the contact page.
                        Account deletion is also available from your profile
                        page; that action is permanent and removes your
                        sessions, plans and trade assessments.
                    </p>
                </LegalSection>

                <LegalSection title="Data location">
                    <p>
                        The application is hosted on Vercel. The database is
                        provisioned on Aiven, hosted in the EU.
                    </p>
                </LegalSection>

                <LegalSection title="Contact">
                    <p>
                        Questions about this policy: reach out via the{' '}
                        <Link href={routes.contact}>contact page</Link>.
                    </p>
                </LegalSection>
            </article>
        </PageTransition>
    );
}
