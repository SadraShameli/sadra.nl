export function riskDollarsToPercent(
    riskDollars: number,
    accountSize: number,
): number {
    return (riskDollars / accountSize) * 100;
}

export function riskPercentToDollars(
    riskPercent: number,
    accountSize: number,
): number {
    return (accountSize * riskPercent) / 100;
}
