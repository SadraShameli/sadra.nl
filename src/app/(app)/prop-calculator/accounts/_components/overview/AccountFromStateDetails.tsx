import { type AccountFromStateModel } from './accountFromStateModel';

export function AccountFromStateDetails({
    model,
}: {
    readonly model: AccountFromStateModel;
}) {
    const { milestone, nextPayout, value } = model;
    return (
        <div className="flex flex-col gap-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">
                    Value from this state, credit-free
                </dt>
                <dd className="tabular-nums">{value.creditFree}</dd>
                <dt className="text-muted-foreground">
                    Value from this state, with end-of-horizon credit
                </dt>
                <dd className="tabular-nums">{value.creditInclusive}</dd>
                <dt className="text-muted-foreground">{milestone.label}</dt>
                <dd className="tabular-nums">
                    {milestone.valueCreditFree} credit-free;{' '}
                    {milestone.valueCreditInclusive} with credit
                </dd>
                <dt className="text-muted-foreground">
                    Credit-free gain from the milestone
                </dt>
                <dd className="tabular-nums">{milestone.gain}</dd>
                {milestone.debited !== null && (
                    <>
                        <dt className="text-muted-foreground">
                            Payout taken at the milestone
                        </dt>
                        <dd className="tabular-nums">{milestone.debited}</dd>
                    </>
                )}
                {nextPayout !== null && (
                    <>
                        <dt className="text-muted-foreground">
                            Expected time to the next payout
                        </dt>
                        <dd className="tabular-nums">
                            {nextPayout.calendarDays}; {nextPayout.sessionDays}
                        </dd>
                        <dt className="text-muted-foreground">
                            Chance the account is lost before the next payout
                        </dt>
                        <dd className="tabular-nums">
                            {nextPayout.accountLostBeforePayout}
                        </dd>
                        <dt className="text-muted-foreground">
                            Chance the next payout itself causes the breach
                        </dt>
                        <dd className="tabular-nums">
                            {nextPayout.breachAtFirstPayout}
                        </dd>
                        <dt className="text-muted-foreground">
                            Expected reset fees before the next payout
                        </dt>
                        <dd className="tabular-nums">{nextPayout.resetFee}</dd>
                        <dt className="text-muted-foreground">
                            Trials that reached a payout
                        </dt>
                        <dd className="tabular-nums">
                            {nextPayout.payingTrials}
                        </dd>
                    </>
                )}
            </dl>
            {milestone.gates.length > 0 && (
                <ul
                    aria-label="Gates not met at the milestone"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-400"
                >
                    {milestone.gates.map((gate) => (
                        <li key={gate}>{gate}</li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-muted-foreground">
                {model.startBasis}; {model.trials}. {model.creditBasis}
            </p>
        </div>
    );
}
