export enum ColorMode {
    Dark = 'dark',
    Light = 'light',
}

export const DEFAULT_COLOR_MODE = ColorMode.Dark;

export function oppositeColorMode(mode: ColorMode): ColorMode {
    switch (mode) {
        case ColorMode.Dark: {
            return ColorMode.Light;
        }
        case ColorMode.Light: {
            return ColorMode.Dark;
        }
    }
}

export function parseColorMode(value: string | undefined): ColorMode {
    return value === ColorMode.Light ? ColorMode.Light : ColorMode.Dark;
}
