import { notFound } from 'next/navigation';

import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import {
    coverLetters,
    defaultResumeVariantKey,
    resumeVariants,
} from '~/lib/site/content';

import ResumeCard from './_components/ResumeCard';

const resumes = [
    {
        name: 'sadra',
        role: 'Full-stack developer & trader',
        title: 'Sadra Shameli',
    },
];

export default async function ResumePage() {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) notFound();

    const variantOptions = Object.values(resumeVariants).map((variant) => ({
        key: variant.key,
        label: variant.label,
    }));
    const coverOptions = coverLetters.map((letter) => ({
        key: letter.key,
        label: letter.label,
    }));

    return (
        <main className="container grid w-full pt-spacing pb-24">
            <div className="mx-auto w-full max-w-4xl">
                <header>
                    <h1 className="font-orbitron text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Resume
                    </h1>
                    <p className="mt-3 text-base text-neutral-400">
                        Formatted as a PDF, view inline or download.
                    </p>
                </header>

                <div className="mt-12 flex flex-col gap-4">
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
            </div>
        </main>
    );
}
