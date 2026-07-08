import { C } from "@thegraid/common-lib";
import { RectShape, type CGF, type GridSpec } from "@thegraid/easeljs-lib";
import { Graphics } from "@thegraid/easeljs-module";
import { H, TP } from "@thegraid/hexlib";


export class CardShape extends RectShape {
  /** => TP.hexRad * H.sqrt3; for current value of TP.hexRad */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  static get onScreenWH() {
    const w = CardShape.onScreenRadius;
    const h = w * 2.5/1.75; // for mini cards! ASSERT: (h > w)
    return { w, h }
  }

  static getWH(r: number, gs: GridSpec, vert = false) {
    const a = gs.cardw! / gs.cardh!;  // aspect ration is independent of dpi
    const ra = (r * a);     // ASSERT: diminsion is integral
    return (a < 1)
      ? (vert ? { w: ra, h: r } : { w: r, h: ra })
      : (vert ? { w: r, h: ra } : { w: ra, h: r })
  }

  /**
   * Modified RectShape: place border stroke inside the WH perimeter.
   * @param fillc base color of card
   * @param strokec [C.grey64] supply '' for no stroke
   * @param rad [CardShape.onScreenRadius] size of shorter side [longer is (rad * 1.4)]
   * @param portrait [false] height is shorter; true -> width is shorter
   * @param ss [rad * .04] StrokeSize for outer border.
   * @param rr [max(w,h) * .05] rounded corner radius
   */
  constructor(fillc = 'lavender', strokec = C.grey64, { w: w0, h: h0 } = CardShape.onScreenWH, portrait = false, ss?: number, rr?: number) {
    const rad = portrait ? w0 : h0;
    const s = ss ?? rad * .04;
    const w = w0 - 2 * s, h = h0 - 2 * s;
    const r = rr ?? Math.max(h, w) * .05;
    super({ x: -w / 2, y: -h / 2, w, h, r, s }, fillc, strokec);
    this.radius = rad;
    this.cache(-w/2-s, -h/2-s, w+s+s, h+s+s);
  }
  /**
   * Fill a triangle inside a CardShape
   * @param ndx 0: ll, 1: ur
   * @param color fillc
   * @param k shrink from size of CardShape._rect WH
   * @param g Graphics
   */
  triangle(ndx: 0|1, color: string, k = 1, strokec = '', g = new Graphics()) {
    const { w: w0, h: h0 } = this._rect, r = this._cRad, s = this._sSiz;
    const w = (w0 + s) / 2, h = (h0 + s) / 2;
    const dx = w * .2;
    const cx0 = [w-k, k-w][ndx], cx = [(cx0-dx), (cx0+dx)][ndx], cy = [h-k, k-h][ndx];
    g.s('').f(color)
    g.mt(-cx, -cy).lt(cx, cy).lt(cx0, cy).lt(cx0, -cy).cp();
    if (strokec) {
      g.s(strokec).ss(s, 1, 1)          // 3. stroke diagonal line
      g.mt(-cx, -cy).lt(cx, cy).cp(); // NW -> SE
    }
    return g;
  }

  radius!: number;

  /** the original RectShape CGF: */
  _rscgf?: CGF;
  form = '';

  /** modify _cgf to produce 2 areas for DualCard */
  dualCgf(f: 'd'|'v' = 'd', ...colors: string[]) {
    this.form = f;
    this._rscgf = this._rscgf ?? this.cgf;    // set it once, the first time.
    const [cl, cr] = colors, strokec = C.BLACK;
    const { w: w0, h: h0 } = this._rect, r = this._cRad, s = this._sSiz;
    const w = (w0 + s) / 2, h = (h0 + s), cc = r*.5; // cc to prevent diagonal exiting the roundrect

    // produce left/right rectangles
    const cgf_v = (colorn: string, g = this.g0) => {
      g.s(strokec).ss(s);
      g.f(cl).rc(-w, -h / 2, w, h, r, 0, 0, r);
      g.f(cr).rc(0 , -h / 2, w, h, 0, r, r, 0);
      return g
    }

    // produce left & right triangles
    const cgf_d = (colorn: string, g = this.g0) => {
      // 4 layers of graphics:
      this.triangle(0, cl, 1, strokec, g)              // 1. left/lower triangle
      this.triangle(1, cr, 1, strokec, g)              // 2. right/up  triangle
      this._rscgf!(C.transparent, g);   // 4. draw outer rect, with "no fill"
      return g;
    }
    this._cgf = f == 'v' ? cgf_v : cgf_d;
  }
}
