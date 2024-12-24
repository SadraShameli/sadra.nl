interface SectionTitleProps {
    text: string;
}

export default function SectionTitle({ text }: SectionTitleProps) {
    return (
        <h2 className="text-center text-3xl font-semibold lg:text-5xl">
            {text}
        </h2>
    );
}
