'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function AccountingError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="Accounting" />;
}
