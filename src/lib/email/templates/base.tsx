import type { ReactNode } from 'react';

import {
    Body,
    Container,
    Font,
    Head,
    Html,
    Link,
    Preview,
    Section,
    Tailwind,
    Text,
} from '@react-email/components';

interface BaseEmailProperties {
    children: ReactNode;
    preview: string;
}

export function BaseEmail({ children, preview }: BaseEmailProperties) {
    const year = new Date().getFullYear();

    return (
        <Html lang="en">
            <Head>
                <Font
                    fallbackFontFamily="monospace"
                    fontFamily="Orbitron"
                    fontStyle="normal"
                    fontWeight={600}
                    webFont={{
                        format: 'woff2',
                        url: 'https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyxSmBoWgz.woff2',
                    }}
                />
            </Head>
            <Preview>{preview}</Preview>
            <Tailwind>
                <Body className="m-0 bg-neutral-100 font-sans">
                    <Container className="mx-auto max-w-140 px-4 py-10">
                        <Section className="rounded-t-lg bg-neutral-900 px-9 py-5">
                            <Link
                                className="text-base font-semibold text-white no-underline"
                                href="https://sadra.nl"
                                style={{
                                    fontFamily:
                                        'Orbitron, ui-monospace, monospace',
                                }}
                            >
                                sadra
                            </Link>
                        </Section>
                        <Section className="rounded-b-lg bg-white px-9 py-10">
                            {children}
                        </Section>
                        <Text className="m-0 mt-6 text-center text-xs text-neutral-400">
                            {'© '}
                            {year}
                            {' Sadra Shameli'}
                        </Text>
                        <Text className="m-0 mt-1 text-center text-xs text-neutral-400">
                            <Link
                                className="text-neutral-400 underline"
                                href="https://sadra.nl"
                            >
                                sadra.nl
                            </Link>
                        </Text>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}
