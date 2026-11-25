import { expect } from 'chai';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './color-utils';

describe('color-utils', () => {
    describe('hexToRgb', () => {
        it('parses #RRGGBB with and without #', () => {
            expect(hexToRgb('#FF8000')).to.deep.equal([255, 128, 0]);
            expect(hexToRgb('00ff7f')).to.deep.equal([0, 255, 127]);
        });

        it('parses black and white', () => {
            expect(hexToRgb('#000000')).to.deep.equal([0, 0, 0]);
            expect(hexToRgb('#ffffff')).to.deep.equal([255, 255, 255]);
        });
    });

    describe('rgbToHex', () => {
        it('produces upper-case #RRGGBB with leading zeros', () => {
            expect(rgbToHex(255, 128, 0)).to.equal('#FF8000');
            expect(rgbToHex(0, 0, 1)).to.equal('#000001');
            expect(rgbToHex(0, 0, 0)).to.equal('#000000');
        });

        it('round-trips with hexToRgb', () => {
            for (const hex of ['#123456', '#ABCDEF', '#00FF00', '#FFFFFF']) {
                expect(rgbToHex(...hexToRgb(hex))).to.equal(hex);
            }
        });
    });

    describe('rgbToHsl', () => {
        it('converts the primary colors', () => {
            expect(rgbToHsl(255, 0, 0)).to.deep.equal([0, 100, 50]);
            expect(rgbToHsl(0, 255, 0)).to.deep.equal([120, 100, 50]);
            expect(rgbToHsl(0, 0, 255)).to.deep.equal([240, 100, 50]);
        });

        it('gives hue and saturation 0 for grays', () => {
            expect(rgbToHsl(0, 0, 0)).to.deep.equal([0, 0, 0]);
            expect(rgbToHsl(128, 128, 128)).to.deep.equal([0, 0, 50]);
            expect(rgbToHsl(255, 255, 255)).to.deep.equal([0, 0, 100]);
        });

        it('handles hues that wrap around (magenta)', () => {
            expect(rgbToHsl(255, 0, 255)).to.deep.equal([300, 100, 50]);
        });
    });

    describe('hslToRgb', () => {
        it('converts the primary colors', () => {
            expect(hslToRgb(0, 100, 50)).to.deep.equal([255, 0, 0]);
            expect(hslToRgb(120, 100, 50)).to.deep.equal([0, 255, 0]);
            expect(hslToRgb(240, 100, 50)).to.deep.equal([0, 0, 255]);
        });

        it('returns grays when saturation is 0', () => {
            expect(hslToRgb(200, 0, 50)).to.deep.equal([128, 128, 128]);
        });

        it('round-trips with rgbToHsl within rounding error', () => {
            for (const rgb of [
                [255, 128, 0],
                [10, 200, 90],
                [77, 77, 200],
                [255, 0, 255],
            ] as Array<[number, number, number]>) {
                const back = hslToRgb(...rgbToHsl(...rgb));
                back.forEach((v, i) => expect(Math.abs(v - rgb[i])).to.be.at.most(3, `channel ${i} of ${rgb}`));
            }
        });
    });
});
