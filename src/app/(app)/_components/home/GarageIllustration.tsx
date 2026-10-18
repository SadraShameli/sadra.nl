const GRID_LINES = Array.from({ length: 13 }, (_, index) => index * 40);
const WHEEL_CENTERS = [112, 356] as const;
const WHEEL_Y = 232;
const SPOKE_ANGLES = Array.from({ length: 10 }, (_, index) => index * 36);
const BODY =
    'M20 206 C19 201.5 22 199.2 30 197.8 C52 193.2 78 188 104 184.2 C130 180.5 154 179 176 177.5 C196 165.5 214 152 238 146 C262 142.2 280 143 292 144.5 C330 149 380 161 422 171.5 L452 175.2 C458 177.5 462 183.5 462 192.5 L460 207.5 L452 212 L390.6 212 A40 40 0 0 0 321.4 212 L146.6 212 A40 40 0 0 0 77.4 212 L30 212 C24 212 20 209.8 20 206 Z';
const CANOPY =
    'M186 177.5 C204 165.5 220 155 240 149.8 C262 146.8 282 146.8 300 149 C318 152 334 158 346 165.5 L330 170 C290 171.5 240 174.5 186 177.5 Z';
const INTAKE =
    'M214 203 C252 197 296 188 338 180.5 C328 189.5 320 198.5 316 207.5 C284 207.5 246 206.8 214 203 Z';
const WING = 'M380 157.2 L448 162.5 L450 166.2 L386 161.8 Z';
const SPOKE = 'M0 -7 C2 -14 3 -20 2 -26 L-1 -26 C-1 -20 -1 -14 0 -7 Z';

export function GarageIllustration({ label }: { readonly label: string }) {
    return (
        <svg
            aria-label={label}
            className="absolute inset-0 size-full"
            preserveAspectRatio="xMidYMid slice"
            role="img"
            viewBox="0 0 480 600"
        >
            <defs>
                <radialGradient cx="50%" cy="50%" id="" r="62%">
                    <stop offset="0%" stopColor="var(--glow)" />
                    <stop offset="100%" stopColor="var(--metal-lo)" />
                </radialGradient>
                <linearGradient id="" x1="0" x2="0" y1="0" y2="1">
                    <stop
                        offset="0%"
                        stopColor="var(--camel)"
                        stopOpacity="0.22"
                    />
                    <stop
                        offset="55%"
                        stopColor="var(--camel)"
                        stopOpacity="0.06"
                    />
                    <stop
                        offset="100%"
                        stopColor="var(--metal-lo)"
                        stopOpacity="0.9"
                    />
                </linearGradient>
                <linearGradient id="" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="var(--ink)" stopOpacity="0" />
                    <stop
                        offset="45%"
                        stopColor="var(--ink)"
                        stopOpacity="0.5"
                    />
                    <stop
                        offset="100%"
                        stopColor="var(--ink)"
                        stopOpacity="0"
                    />
                </linearGradient>
                <linearGradient id="" x1="0" x2="0" y1="0" y2="1">
                    <stop
                        offset="0%"
                        stopColor="var(--camel)"
                        stopOpacity="0.14"
                    />
                    <stop
                        offset="100%"
                        stopColor="var(--camel)"
                        stopOpacity="0"
                    />
                </linearGradient>
                <filter height="300%" id="" width="200%" x="-50%" y="-100%">
                    <feGaussianBlur stdDeviation="3" />
                </filter>
            </defs>

            <rect fill="url(#garage-spot)" height="600" width="480" />
            <g stroke="var(--grid)" strokeWidth="1">
                {GRID_LINES.map((offset) => (
                    <line
                        key={`v${String(offset)}`}
                        x1={offset}
                        x2={offset}
                        y1="0"
                        y2="600"
                    />
                ))}
                {GRID_LINES.map((offset) => (
                    <line
                        key={`h${String(offset)}`}
                        x1="0"
                        x2="480"
                        y1={offset + 20}
                        y2={offset + 20}
                    />
                ))}
            </g>

            <g
                fill="var(--ink-muted)"
                fontFamily="var(--font-mono)"
                fontSize="11"
                letterSpacing="2.4"
            >
                <text x="32" y="64">
                    SIDE ELEVATION
                </text>
                <text fill="var(--camel)" textAnchor="end" x="448" y="64">
                    NO. 01
                </text>
                <text x="32" y="548">
                    STUDY
                </text>
                <text textAnchor="end" x="448" y="548">
                    SHEET A
                </text>
            </g>
            <line stroke="var(--line-camel)" x1="32" x2="448" y1="80" y2="80" />
            <line
                stroke="var(--line-camel)"
                x1="32"
                x2="448"
                y1="524"
                y2="524"
            />

            <g transform="translate(0 130)">
                <rect
                    fill="url(#garage-floor)"
                    height="70"
                    width="480"
                    y="266"
                />
                <line
                    stroke="var(--line-strong)"
                    x1="0"
                    x2="480"
                    y1="266"
                    y2="266"
                />
                <ellipse
                    cx="240"
                    cy="268"
                    fill="var(--metal-lo)"
                    opacity="0.95"
                    rx="226"
                    ry="6"
                />

                <path
                    d={WING}
                    fill="var(--metal-lo)"
                    stroke="var(--camel)"
                    strokeLinejoin="round"
                    strokeWidth="1.3"
                />
                <path
                    d="M420 164.8 L416 172.2"
                    stroke="var(--camel)"
                    strokeWidth="1.3"
                />

                <path
                    d={BODY}
                    fill="url(#garage-body)"
                    stroke="var(--camel)"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                />
                <path
                    d={CANOPY}
                    fill="var(--metal-lo)"
                    fillOpacity="0.75"
                    stroke="var(--camel)"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                />
                <path
                    d="M206 171.5 C238 158 280 152 330 158"
                    fill="none"
                    stroke="url(#garage-sheen)"
                    strokeLinecap="round"
                    strokeWidth="1.2"
                />
                <path
                    d={INTAKE}
                    fill="var(--metal-lo)"
                    stroke="var(--camel)"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                />

                <g
                    fill="none"
                    stroke="var(--line-camel)"
                    strokeLinecap="round"
                    strokeWidth="1.1"
                >
                    <path d="M120 186.5 C200 184.2 300 173 432 173.8" />
                    <path d="M182 180.5 C196 191 206 201.5 210 211.2" />
                    <path d="M230 204.5 L316 204.5 M226 200.8 L322 192.5" />
                    <path d="M424 183.5 L452 185 M426 189.5 L454 191 M428 195.5 L456 197" />
                    <path d="M440 212 L450 221 M428 212 L438 221 M416 212 L426 221" />
                </g>
                <g fill="none" stroke="var(--camel)" strokeLinecap="round">
                    <path d="M148 216.5 L320 216.5" strokeWidth="1.4" />
                    <path d="M16 213.5 L74 213.5" strokeWidth="1.4" />
                    <path
                        d="M196 174.5 C198 169.2 207 168.5 211 173 Z"
                        strokeWidth="1.2"
                    />
                </g>

                <path
                    d="M30 200 L66 193.2"
                    filter="url(#garage-glow)"
                    stroke="var(--camel)"
                    strokeLinecap="round"
                    strokeWidth="4"
                />
                <path
                    d="M30 200 L66 193.2"
                    stroke="var(--ink)"
                    strokeLinecap="round"
                    strokeWidth="1.4"
                />
                <path
                    d="M452 176 L462 189.5"
                    filter="url(#garage-glow)"
                    stroke="var(--ink)"
                    strokeLinecap="round"
                    strokeWidth="4"
                />
                <path
                    d="M452 176 L462 189.5"
                    stroke="var(--ink)"
                    strokeLinecap="round"
                    strokeWidth="1.6"
                />

                {WHEEL_CENTERS.map((cx) => (
                    <g
                        key={cx}
                        transform={`translate(${String(cx)} ${String(WHEEL_Y)})`}
                    >
                        <circle
                            fill="var(--metal-lo)"
                            r="34"
                            stroke="var(--line-strong)"
                            strokeWidth="6"
                        />
                        <circle
                            fill="none"
                            r="34"
                            stroke="var(--camel)"
                            strokeWidth="1.1"
                        />
                        <circle
                            fill="none"
                            r="27"
                            stroke="var(--camel)"
                            strokeWidth="1.4"
                        />
                        <path
                            d="M-15 -14 A20.5 20.5 0 0 1 9 -18.5"
                            fill="none"
                            stroke="var(--ink)"
                            strokeLinecap="round"
                            strokeWidth="3"
                        />
                        {SPOKE_ANGLES.map((angle) => (
                            <path
                                d={SPOKE}
                                fill="var(--camel)"
                                key={angle}
                                transform={`rotate(${String(angle)})`}
                            />
                        ))}
                        <circle
                            fill="var(--metal-lo)"
                            r="6"
                            stroke="var(--camel)"
                            strokeWidth="1.4"
                        />
                        <circle fill="var(--camel)" r="2" />
                    </g>
                ))}

                <g stroke="var(--line-camel)" strokeWidth="1">
                    <line x1="112" x2="356" y1="300" y2="300" />
                    <line x1="112" x2="112" y1="292" y2="308" />
                    <line x1="356" x2="356" y1="292" y2="308" />
                </g>
                <text
                    fill="var(--ink-muted)"
                    fontFamily="var(--font-mono)"
                    fontSize="10"
                    letterSpacing="2.4"
                    textAnchor="middle"
                    x="234"
                    y="322"
                >
                    WHEELBASE
                </text>
            </g>
        </svg>
    );
}
