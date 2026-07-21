import { type Metadata } from 'next';

import { cn } from '~/lib/utilities';

import CalculatorShell from './_components/CalculatorShell';

export const metadata: Metadata = {
    description:
        'Interactive Monte Carlo calculator for futures prop firms — model pass probability, days to pass, total cost, and expected monthly net for Apex, Take Profit Trader, Tradeify, Lucid, My Funded Futures, and TopStep.',
    title: 'Prop Firm Calculator',
};

export default function PropertyCalculatorPage() {
    return (
        <main
            className={cn('app-prop-calculator', 'container pt-spacing pb-24')}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Futures Prop Firm Calculator
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    Pick a firm, plan, and account size. Tune your winrate, RR,
                    and trade frequency. The simulator runs a Monte Carlo
                    against each firm&apos;s real drawdown, daily-loss, and
                    consistency rules to estimate pass odds, costs, and payouts.
                </p>
            </header>

            <CalculatorShell />
        </main>
    );
}
