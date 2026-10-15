'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function ProfileError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="Your profile" />;
}
