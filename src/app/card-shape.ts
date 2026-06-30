import { C } from "@thegraid/common-lib";
import { RectShape, type CGF } from "@thegraid/easeljs-lib";
import { H, TP } from "@thegraid/hexlib";


export class CardShape extends RectShape {
  /** => TP.hexRad * H.sqrt3; for current value of TP.hexRad */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };

  /**
   * Modified RectShape: place border stroke inside the WH perimeter.
   * @param fillc base color of card
   * @param strokec [C.grey64] supply '' for no stroke
   * @param rad [CardShape.onScreenRadius] size of shorter side [longer is (rad * 1.4)]
   * @param portrait [false] height is shorter; true -> width is shorter
   * @param ss [rad * .04] StrokeSize for outer border.
   * @param rr [max(w,h) * .05] rounded corner radius
   */
  constructor(fillc = 'lavender', strokec = C.grey64, rad = CardShape.onScreenRadius, portrait = false, ss?: number, rr?: number) {
    if (rad <= 1) rad = rad * CardShape.onScreenRadius;
    const s = ss ?? rad * .04;
    const a = 3.5 / 2.5; // aspect: length of long side relative to short side = 1.4
    const w = (portrait ? rad : rad * a) - 2 * s, h = (portrait ? rad * a : rad) - 2 * s;
    const r = rr ?? Math.max(h, w) * .05;
    super({ x: -w / 2, y: -h / 2, w, h, r, s }, fillc, strokec);
    this.radius = rad;
    this.cache(-w/2-s, -h/2-s, w+s+s, h+s+s);
  }

  radius!: number;
  /** modify _cgf to produce 2 left/right rectangles */
  dualCgf0(strokec: string, ...colors: string[]) {
    const [cl, cr] = colors;
    const { w: w0, h: h0 } = this._rect, r = this._cRad, s = this._sSiz;
    const w = (w0 + s) / 2, h = (h0 + s);
    this._cgf = (colorn: string, g = this.g0) => {
      g.s(strokec).ss(s);
      g.f(cl).rc(-w, -h / 2, w, h, r, 0, 0, r);
      g.f(cr).rc(0 , -h / 2, w, h, 0, r, r, 0);
      return g
    }
  }

  /** the original RectShape CGF: */
  _rscgf?: CGF;

  /** modify _cgf to produce left/right triangles */
  dualCgf(strokec: string, ...colors: string[]) {
    this._rscgf = this._rscgf ?? this.cgf;    // set it once, the first time.
    const [cl, cr] = colors;
    const { w: w0, h: h0 } = this._rect, r = this._cRad, s = this._sSiz;
    const w = (w0 + s) / 2, h = (h0 + s), cc = r*.5, k = 1;
    this._cgf = (colorn: string, g = this.g0) => {
      // 4 layers of graphics:
      this._rscgf!(cl, g);  // 1. draw outer rect with left color
      g.s('').ss(s, 1, 1);  // 2. draw triangle with right color (with no strokec)
      g.f(cr).mt(k-w, k-h/2).lt(w-k, h/2-k).lt(w-k, k-h/2).cp();
      g.s(strokec).ss(s, 1, 1); // 3. draw diagonal line with strockc
      g.mt(cc-w, cc-h/2).lt(w-cc, h/2-cc).cp(); // NW -> SE
      this._rscgf!(C.transparent, g);  // 4. draw outer rect again, with "no fill"
      return g;
    }
  }
}
