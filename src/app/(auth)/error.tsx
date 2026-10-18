'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function AuthError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="This page" />;
}
