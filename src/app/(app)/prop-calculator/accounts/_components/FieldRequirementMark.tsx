export function FieldRequirementMark({ text }: { readonly text: string }) {
    return (
        <>
            {' '}
            <span className="text-xs font-normal text-muted-foreground">
                ({text})
            </span>
        </>
    );
}
