'use client';
import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

import { type ReadingChartProps } from './Chart';

export function ReadingChart({ xAxis, yAxis }: ReadingChartProps) {
    const ref = useRef(null);

    const margin = { top: 10, right: 30, bottom: 30, left: 50 },
        width = 460 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    const yMax = Math.max(...yAxis);
    const yMin = Math.min(...yAxis);

    useEffect(() => {
        const svg = d3
            .select(ref.current)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand().domain(xAxis).range([0, width]).padding(0.1);
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x));

        const y = d3.scaleLinear().domain([yMin, yMax]).range([0, height]);
        svg.append('g').call(d3.axisLeft(y));

        // svg.selectAll('mybar')
        //     .data(data)
        //     .join('rect')
        //     .attr('x', (d) => x(d.Country))
        //     .attr('y', (d) => y(d.Value))
        //     .attr('width', x.bandwidth())
        //     .attr('height', (d) => height - y(d.Value))
        //     .attr('fill', '#5f0f40');
    }, [
        height,
        margin.bottom,
        margin.left,
        margin.right,
        margin.top,
        width,
        xAxis,
        yMax,
        yMin,
    ]);

    return <svg ref={ref} />;
}
