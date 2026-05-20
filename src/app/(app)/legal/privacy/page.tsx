import { type Metadata } from 'next';
import Link from 'next/link';

import { routes } from '~/lib/routes';

export const metadata: Metadata = {
    description: 'How sadra.nl handles personal data.',
    title: 'Privacy policy',
};

export default function PrivacyPage() {
    const updated = '2026-05-20';
    return (
        <article>
            <h1>Privacy policy</h1>
            <p className="text-xs text-muted-foreground">
                Last updated: {updated}
            </p>

            <h2>What we collect</h2>
            <ul>
                <li>
                    <strong>Account data:</strong> email address, display name,
                    and a hashed password if you sign up with credentials.
                </li>
                <li>
                    <strong>Session data:</strong> an opaque session token, your
                    IP address and user-agent, used to keep you signed in and to
                    let you see and revoke your active sessions.
                </li>
                <li>
                    <strong>Trading journal:</strong> the trade plans,
                    assessments and pre-market checklists you create.
                </li>
                <li>
                    <strong>Sensor Hub:</strong> IoT devices linked to your
                    account submit sensor readings and audio recordings.
                </li>
                <li>
                    <strong>Analytics:</strong> aggregated, anonymous page-view
                    and performance metrics via Vercel Analytics and Speed
                    Insights.
                </li>
            </ul>

            <h2>What we don&apos;t collect</h2>
            <p>
                No cross-site advertising trackers. No fingerprinting. No sale
                of personal data.
            </p>

            <h2>Your rights (GDPR)</h2>
            <p>
                You can request a copy of your data or its deletion at any time
                by emailing the address on the contact page. Account deletion is
                also available from your profile page; that action is permanent
                and removes your sessions, plans and trade assessments.
            </p>

            <h2>Data location</h2>
            <p>
                The application is hosted on Vercel. The database is provisioned
                on Aiven, hosted in the EU.
            </p>

            <h2>Contact</h2>
            <p>
                Questions about this policy: reach out via the{' '}
                <Link href={routes.contact}>contact page</Link>.
            </p>
        </article>
    );
}
