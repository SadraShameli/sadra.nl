import { type Metadata } from 'next';

import { LegalSection } from '~/app/(app)/legal/_components/LegalSection';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { buildPublicPageMetadata } from '~/lib/site/metadata';
import { routes } from '~/lib/site/routes';
import { SITE_NAME } from '~/lib/site/siteName';

export const metadata: Metadata = buildPublicPageMetadata({
    canonical: routes.legal.terms,
    description: `Terms of use for ${SITE_NAME}.`,
    title: 'Terms of use',
});

export default function TermsPage() {
    return (
        <PageTransition>
            <article>
                <PageHeader className="not-prose" title="Terms of use" />

                <LegalSection title="Personal use">
                    <p>
                        {SITE_NAME} is a personal site. The Trade Checklist and
                        Prop Calculator are offered as analytical tools for
                        personal research; they are not financial advice. Any
                        decision you make from the output of these tools is your
                        own.
                    </p>
                </LegalSection>

                <LegalSection title="Sensor Hub">
                    <p>
                        Devices that ingest into the Sensor Hub backend must use
                        a token issued from the admin UI. Anonymous ingest is
                        not supported.
                    </p>
                </LegalSection>

                <LegalSection title="Disclaimer">
                    <p>
                        The site is provided &ldquo;as is&rdquo; without
                        warranty. No liability is accepted for trading losses,
                        missed readings, or downtime.
                    </p>
                </LegalSection>

                <LegalSection title="Acceptable use">
                    <p>
                        Don&apos;t attempt to circumvent authentication, scrape
                        data you don&apos;t own, or upload content you
                        don&apos;t have the rights to.
                    </p>
                </LegalSection>
            </article>
        </PageTransition>
    );
}
