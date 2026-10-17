import type { ReactNode } from 'react';

import {
    Body,
    Container,
    Head,
    Html,
    Link,
    Preview,
    Section,
    Tailwind,
    Text,
} from '@react-email/components';

import { EMAIL_COLORS, EMAIL_FONT_FAMILIES } from './EmailPalette';

const EMAIL_TAILWIND_CONFIG = {
    theme: {
        extend: {
            colors: EMAIL_COLORS,
            fontFamily: {
                sans: [...EMAIL_FONT_FAMILIES.sans],
                serif: [...EMAIL_FONT_FAMILIES.serif],
            },
        },
    },
};

interface BaseEmailProperties {
    children: ReactNode;
    notificationSettingsUrl?: string;
    preview: string;
}

export function BaseEmail({
    children,
    notificationSettingsUrl,
    preview,
}: BaseEmailProperties) {
    const year = new Date().getFullYear();

    return (
        <Html lang="en">
            <Head />
            <Preview>{preview}</Preview>
            <Tailwind config={EMAIL_TAILWIND_CONFIG}>
                <Body className="m-0 bg-ground font-sans text-ink">
                    <Container className="mx-auto max-w-140 px-4 py-10">
                        <Section className="rounded-t-xl border border-b-0 border-solid border-line bg-surface px-9 pt-8 pb-2">
                            <Link
                                className="font-serif text-2xl font-medium text-ink no-underline"
                                href="https://sadra.nl"
                            >
                                sadra<span className="text-camel">.</span>nl
                            </Link>
                        </Section>
                        <Section className="rounded-b-xl border border-t-0 border-solid border-line bg-surface px-9 pt-6 pb-10">
                            {children}
                        </Section>
                        <Text className="m-0 mt-6 text-center text-xs text-ink-muted">
                            {'© '}
                            {year}
                            {' Sadra Shameli'}
                        </Text>
                        <Text className="m-0 mt-1 text-center text-xs text-ink-muted">
                            <Link
                                className="text-ink-muted underline"
                                href="https://sadra.nl"
                            >
                                sadra.nl
                            </Link>
                        </Text>
                        {notificationSettingsUrl === undefined ? null : (
                            <Text className="m-0 mt-1 text-center text-xs text-ink-muted">
                                <Link
                                    className="text-ink-muted underline"
                                    href={notificationSettingsUrl}
                                >
                                    Manage notifications
                                </Link>
                            </Text>
                        )}
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}
