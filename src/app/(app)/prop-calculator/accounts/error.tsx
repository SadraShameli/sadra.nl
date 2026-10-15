'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function PropAccountsError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="Prop accounts" />;
}
