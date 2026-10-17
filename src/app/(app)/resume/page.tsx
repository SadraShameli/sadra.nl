import { type Instant } from 'next';

import { CapsulePage } from '~/app/(app)/_components/CapsulePage';
import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { siteContent } from '~/lib/site/content';
import {
    coverLetters,
    defaultResumeVariantKey,
    resumeVariants,
} from '~/lib/site/resume';

import ResumeCard from './_components/ResumeCard';

export const instant: Instant = false;

const resumes = [
    {
        name: 'sadra',
        role: 'Full-stack developer & trader',
        title: 'Sadra Shameli',
    },
];

export default async function ResumePage() {
    await requireRootUser();

    const variantOptions = Object.values(resumeVariants).map((variant) => ({
        key: variant.key,
        label: variant.label,
    }));
    const coverOptions = coverLetters.map((letter) => ({
        key: letter.key,
        label: letter.label,
    }));

    return (
        <PageTransition>
            <CapsulePage>
                <ToolPageHeader
                    eyebrow={siteContent.manifest.name}
                    lead="Formatted as a PDF, view inline or download."
                    title="Resume"
                />

                <div className="flex flex-col gap-4">
                    {resumes.map((resume) => (
                        <ResumeCard
                            coverOptions={coverOptions}
                            defaultVariantKey={defaultResumeVariantKey}
                            key={resume.name}
                            resume={resume}
                            variantOptions={variantOptions}
                        />
                    ))}
                </div>
            </CapsulePage>
        </PageTransition>
    );
}
