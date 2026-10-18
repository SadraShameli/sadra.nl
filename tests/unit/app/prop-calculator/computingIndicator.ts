const COMPUTING_LABEL = 'Computing';

export function hasComputingIndicator(scope: null | ParentNode): boolean {
    return [...(scope?.querySelectorAll('[role="status"]') ?? [])].some(
        (status) => status.textContent === COMPUTING_LABEL,
    );
}
