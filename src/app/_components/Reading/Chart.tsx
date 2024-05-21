// 'use client';

// import * as d3 from 'd3';
// import { useEffect, useRef } from 'react';

// type ReadingChartProps = {
//     xAxis: number[];
//     yAxis: number[];
//     data: [number, number][];
// };

// export function ReadingChart({ xAxis, yAxis, data }: ReadingChartProps) {
//     const svgRef = useRef(null),
//         xAxisRef = useRef(null),
//         yAxisRef = useRef(null);

//     const margin = { top: 20, right: 30, bottom: 30, left: 60 };
//     const width = 600,
//         height = 400;
//     const yMax = Math.max(...yAxis),
//         yMin = Math.min(...yAxis);

//     const xExtent = d3.extent(xAxis, (d) => new Date(d));
//     const x = d3
//         .scaleTime()
//         .range([margin.left, width - margin.right])
//         .domain(
//             xExtent[0] !== undefined && xExtent[1] !== undefined ? xExtent : [],
//         );

//     const y = d3
//         .scaleLinear()
//         .range([height - margin.bottom, margin.top])
//         .domain([yMin, yMax]);

//     const area = d3
//         .area()
//         .x((d) => x(d[0]))
//         .y0(y(yMin))
//         .y1((d) => y(d[1]));

//     useEffect(() => {
//         if (xAxisRef.current && x)
//             d3.select(xAxisRef.current)
//                 .call(
//                     d3
//                         .axisBottom(x)
//                         .tickSizeOuter(0)
//                         .tickSize(0)
//                         .tickPadding(10),
//                 )
//                 .call((g) => g.select('.domain').remove());
//     }, [xAxisRef, x]);
//     useEffect(() => {
//         d3.select(yAxisRef.current)
//             .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
//             .call((g) => g.select('.domain').remove());
//     }, [yAxisRef, y]);

//     return (
//         <svg
//             className="text-muted-foreground"
//             viewBox="0 0 1500 1500"
//             ref={svgRef}
//         >
//             <g
//                 className="font-geist text-xs"
//                 transform={`translate(0,${height - margin.bottom})`}
//                 ref={xAxisRef}
//             />
//             <g
//                 className="font-geist text-xs"
//                 transform={`translate(${margin.left},0)`}
//                 ref={yAxisRef}
//             />
//             <path
//                 className="fill-muted-foreground/20 stroke-muted-foreground"
//                 d={area(data) as string | undefined}
//             />
//         </svg>
//     );
// }
