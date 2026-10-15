'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function ResumeError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="The resume" />;
}
