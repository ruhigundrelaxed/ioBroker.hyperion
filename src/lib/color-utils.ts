/**
 * Color conversion utilities: RGB <-> HSL <-> HEX
 * No external dependencies.
 */

export function hexToRgb(hex: string): [number, number, number] {
    const cleaned = hex.replace(/^#/, '');
    const num = parseInt(cleaned, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rN = r / 255;
    const gN = g / 255;
    const bN = b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const delta = max - min;
    const l = (max + min) / 2;

    if (delta === 0) {
        return [0, 0, Math.round(l * 100)];
    }

    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    let h: number;
    if (max === rN) {
        h = ((gN - bN) / delta + (gN < bN ? 6 : 0)) / 6;
    } else if (max === gN) {
        h = ((bN - rN) / delta + 2) / 6;
    } else {
        h = ((rN - gN) / delta + 4) / 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hN = h / 360;
    const sN = s / 100;
    const lN = l / 100;

    if (sN === 0) {
        const v = Math.round(lN * 255);
        return [v, v, v];
    }

    const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
    const p = 2 * lN - q;

    const hueToRgb = (t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    return [
        Math.round(hueToRgb(hN + 1 / 3) * 255),
        Math.round(hueToRgb(hN) * 255),
        Math.round(hueToRgb(hN - 1 / 3) * 255),
    ];
}
