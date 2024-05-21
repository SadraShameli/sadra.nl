'use client';

import * as d3 from 'd3';
import { useEffect, useId, useMemo, useRef } from 'react';

const MARGIN = { top: 30, right: 30, bottom: 50, left: 50 };

type ReadingChartProps = {
    xAxis: string[];
    yAxis: number[];
    data: [string, number][];
};

export function ReadingChart({ xAxis, yAxis, data }: ReadingChartProps) {
    const width = 460,
        height = 350;

    const axesRef = useRef(null);
    const boundsWidth = width - MARGIN.right - MARGIN.left;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;

    const yMax = Math.max(...yAxis);
    const yScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([0, yMax || 0])
            .range([boundsHeight, 0]);
    }, [boundsHeight, yMax]);

    const xScale = useMemo(() => {
        return d3.scaleBand().domain(xAxis).range([0, boundsWidth]);
    }, [boundsWidth, xAxis]);

    useEffect(() => {
        const svgElement = d3.select(axesRef.current);
        svgElement.selectAll('*').remove();
        const xAxisGenerator = d3.axisBottom(xScale);
        svgElement
            .append('g')
            .attr('transform', 'translate(0,' + boundsHeight + ')')
            .call(xAxisGenerator);

        const yAxisGenerator = d3.axisLeft(yScale);
        svgElement.append('g').call(yAxisGenerator);
    }, [xScale, yScale, boundsHeight]);

    const areaBuilder = d3
        .area<[string, number]>()
        .x((d) => xScale(d[0]))
        .y1((d) => yScale(d[1]))
        .y0(yScale(0));
    const areaPath = areaBuilder(data);

    // Build the line
    const lineBuilder = d3
        .line<[string, number]>()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]));
    const linePath = lineBuilder(data);

    if (!linePath || !areaPath) {
        return null;
    }

    return (
        <div>
            <svg width={width} height={height}>
                <g
                    width={boundsWidth}
                    height={boundsHeight}
                    transform={`translate(${[MARGIN.left, MARGIN.top].join(',')})`}
                >
                    <path
                        d={areaPath}
                        opacity={1}
                        stroke="none"
                        fill="#9a6fb0"
                        fillOpacity={0.4}
                    />
                    <path
                        d={linePath}
                        opacity={1}
                        stroke="#9a6fb0"
                        fill="none"
                        strokeWidth={2}
                    />
                </g>
                <g
                    width={boundsWidth}
                    height={boundsHeight}
                    ref={axesRef}
                    transform={`translate(${[MARGIN.left, MARGIN.top].join(',')})`}
                />
            </svg>
        </div>
    );
}
