import { C } from "@thegraid/common-lib";
import type { GridSpec } from "@thegraid/easeljs-lib";

export type ColId = ''|'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H';

/** 0: Black, 1: r, 2: g, 3: b, 4: v, 5: white */ // white: for blank cards
export type Faction =  (0 | 1 | 2 | 3 | 4 | 5);

export const nFacs = 4;

export class Statics {
  static colNames = ['','A','B','C','D','E','F','G','H'] as ColId[];
  static bidFactions: Faction[][] = [[], [4, 2, 3, 1, ], [3, 1], [4, 2], [0]];

  static candyColors = [C.BLACK, '#FF0000', '#ebb000', '#0066FF', '#9900CC', C.WHITE];
  static factionColors = [C.BLACK, C.RED, '#fff205', '#0066CC', '#c941ff', C.WHITE]; // #00DD00

  // 816 x 1110; 816-66 = 750px, 1110-66 = 1044px; (2.5" = 63.5mm x 3.48" = 88.4 mm) (248.03 x 346.5) (826.7 x 1044.8)

  // 822 x 1122; 822-72 = 750px, 1122-72 = 1050px; (2.5 x 3.5)" (63.5 x 88.9)mm
  static cardSingle_3_5_px: GridSpec = {
    width: 3600, height: 5400, nrow: 6, ncol: 3, cardw: 1050, cardh: 750, // (inch_w*dpi + 2*bleed)
    x0: 1150/2, y0: 850/2, delx: 1150, dely: 850, bleed: 36, double: false, land: true,
  };

  // (63 x 88)mm; (2.48 x 3.465)" (744 x 1036)px + 72(bleed) = (816 x 1108)px
  static cardSingle_63x88_px: GridSpec = {
    width: 3600, height: 5400, nrow: 6, ncol: 3, cardw: 1036, cardh: 744, // (inch_w*dpi + 2*bleed)
    x0: 1146/2, y0: 844/2, delx: 1146, dely: 844, bleed: 36, double: false, land: true,
  };

  // "2.45 x 3.95": (804 x 1251)px -72 = (732 x 1179)px =  (2.44 x 3.93)"
  static cardSingle_trump_px: GridSpec = {
    width: 1300*4, height: 880*6, nrow: 6, ncol: 4, cardw: 1179, cardh: 732, // (inch_w*dpi + 2*bleed)
    x0: 650, y0: 440, delx: 1300, dely: 880, bleed: 36, double: false, land: true,
  };

  static cardSingle_trump_pxv: GridSpec = {
    width: 880*4, height: 1300*6, nrow: 6, ncol: 4, cardw: 1179, cardh: 732, // (inch_w*dpi + 2*bleed)
    x0: 440, y0: 650, dely: 1300, delx: 880, bleed: 36, double: false, land: false,
  };

  // 18 cards: portrait mode; browser viewport may cut off bottom
  static cardSingle_3_5_in: GridSpec = {
    dpi: 300, width: 12, height: 18, nrow: 6, ncol: 3, cardh: 3.5, cardw: 2.5, // (inch_w*dpi + 2*bleed)
    x0: .5 + 3.5 * .5, y0: 113/300 + 2.5/2, delx: 3.85, dely: 2.95, bleed: 36/300, double: false, land: true,
  };

  // { ...ImageGrid, ncol: 6, width: 4200, split: false } MPC: 597 x 822
  static cardSingle_1_75_px : GridSpec= {
    width: 4200, height: 5400, nrow: 6, ncol: 6, cardh: 525, cardw: 750, double: false, split: false, land: false,
    x0: 334 + 1.75 * 150, y0: 150 + 2.5 * 150, delx: 600, dely: 825, bleed: 36, // (2705-305)/4, (1770-120)/2
  };

  static cardSingle_1_75_in: GridSpec = { // mini-card aspect = 2.5/1.75 = 1.429!
    dpi: 300, width: 14, height: 20, nrow: 6, ncol: 6, cardh: 1.75, cardw: 2.5, double: false, split: false, land: false,
    x0: 1.33 + 1.75/2, y0: .5 + 2.5/2, delx: 2.1, dely: 2.80, bleed: 36/300, // (2705-305)/4, (1770-120)/2
  };
}
