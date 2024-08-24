'use client';
import {
    CategoryScale,
    type ChartData,
    Chart as ChartJS,
    type ChartOptions,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Title,
    Tooltip,
} from 'chart.js';
import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';

type ReadingChartProps = {
    xAxis: string[];
    yAxis: number[];
    yName: string;
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

const options: ChartOptions<'line'> = {
    animation: {
        duration: 2000,
        easing: 'easeOutExpo',
    },
    responsive: true,
    plugins: {
        legend: {
            display: false,
        },
    },
    elements: {
        point: {
            radius: 0,
            hitRadius: 10,
        },
    },
    scales: {
        x: {
            grid: {
                display: false,
            },
            ticks: {
                color: colors.neutral[500],
                font: {
                    weight: 'bold',
                },
            },
        },
        y: {
            beginAtZero: true,
            grid: {
                display: false,
            },
            ticks: {
                color: colors.neutral[500],
                font: {
                    weight: 'bold',
                },
            },
        },
    },
};

export function ReadingAreaChart({ xAxis, yAxis, yName }: ReadingChartProps) {
    const chartData = useMemo<ChartData<'line'>>(() => {
        return {
            labels: xAxis,
            datasets: [
                {
                    fill: true,
                    label: yName,
                    data: yAxis,
                    borderColor: colors.neutral[400],
                    backgroundColor: colors.neutral[800],
                },
            ],
        };
    }, [xAxis, yAxis, yName]);

    return <Line options={options} data={chartData} />;
}
