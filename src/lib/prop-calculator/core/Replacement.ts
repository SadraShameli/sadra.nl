export interface ReplacementEconomics {
    attemptsPerFundedAccount: number;
    costPerFundedAccount: number;
    daysPerFundedAccount: number;
}

export function replacementEconomics(options: {
    evalPrice: number;
    meanDaysOnFail: number;
    meanDaysOnPass: number;
    passRate: number;
}): ReplacementEconomics {
    const { evalPrice, meanDaysOnFail, meanDaysOnPass, passRate } = options;
    if (passRate <= 0) {
        return {
            attemptsPerFundedAccount: Infinity,
            costPerFundedAccount: Infinity,
            daysPerFundedAccount: Infinity,
        };
    }
    const attempts = 1 / passRate;
    return {
        attemptsPerFundedAccount: attempts,
        costPerFundedAccount: evalPrice * attempts,
        daysPerFundedAccount: meanDaysOnPass + (attempts - 1) * meanDaysOnFail,
    };
}
