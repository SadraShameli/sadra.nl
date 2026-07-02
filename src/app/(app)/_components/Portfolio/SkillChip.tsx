import { Badge } from '~/components/ui/Badge';

type SkillChipProperties = {
    label: string;
};

export default function SkillChip({ label }: SkillChipProperties) {
    return (
        <Badge
            asChild
            className="rounded-full border-white/15 bg-white/2.5 px-3 py-1 text-[13px] leading-none font-medium text-neutral-200"
            variant="outline"
        >
            <li className="app-portfolio__skill">{label}</li>
        </Badge>
    );
}
