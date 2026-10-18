'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

import {
    DEFAULT_FOOTER_VARIANT,
    type FooterVariant,
    footerVariantFor,
} from '~/app/(app)/_components/footerVariant';

interface FooterSwitchProperties {
    readonly variants: FooterVariants;
}

type FooterVariants = Readonly<Record<FooterVariant, ReactNode>>;

export function FooterSwitch({ variants }: FooterSwitchProperties) {
    return (
        <Suspense fallback={variants[DEFAULT_FOOTER_VARIANT]}>
            <FooterAtPath variants={variants} />
        </Suspense>
    );
}

function FooterAtPath({ variants }: FooterSwitchProperties) {
    return variants[footerVariantFor(usePathname())];
}
