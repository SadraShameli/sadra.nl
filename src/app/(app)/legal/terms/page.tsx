import { type Metadata } from 'next';

export const metadata: Metadata = {
    description: 'Terms of use for sadra.nl.',
    title: 'Terms of use',
};

export default function TermsPage() {
    return (
        <article>
            <h1>Terms of use</h1>

            <h2>Personal use</h2>
            <p>
                sadra.nl is a personal site. The Trade Checklist and Prop
                Calculator are offered as analytical tools for personal
                research; they are not financial advice. Any decision you make
                from the output of these tools is your own.
            </p>

            <h2>Sensor Hub</h2>
            <p>
                Devices that ingest into the Sensor Hub backend must use a token
                issued from the admin UI. Anonymous ingest is not supported.
            </p>

            <h2>Disclaimer</h2>
            <p>
                The site is provided &ldquo;as is&rdquo; without warranty. No
                liability is accepted for trading losses, missed readings, or
                downtime.
            </p>

            <h2>Acceptable use</h2>
            <p>
                Don&apos;t attempt to circumvent authentication, scrape data you
                don&apos;t own, or upload content you don&apos;t have the rights
                to.
            </p>
        </article>
    );
}
