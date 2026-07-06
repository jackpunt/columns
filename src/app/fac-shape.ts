import { C } from "@thegraid/common-lib";
import { Shape, type Graphics } from "@thegraid/easeljs-module";
import { Statics } from "./statics";

export class FacShape extends Shape {

  /** a square of faction colors at [0,0] */
  facRect(bidCol: number, d2 = 20, y = 0, g = this.graphics) {
    const factions = Statics.bidFactions[bidCol];
    const colors = factions.map(n => Statics.factionColors[n])

    switch (colors.length) {
      case 1: this.oneRect(g, colors, d2); break;
      case 2: this.twoRect(g, colors, d2); break;
      case 4: this.fourRect(g, colors, d2); break;
    }
    this.y += y;
    return factions;
  }

  fourRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2;
    g.ss(1).s(C.black)
    g.f(c[2]).rc(-d, 0, d, d, r, 0, 0, 0)
    g.f(c[0]).rc(+0, 0, d, d, 0, r, 0, 0)
    g.f(c[1]).rc(+0, d, d, d, 0, 0, r, 0)
    g.f(c[3]).rc(-d, d, d, d, 0, 0, 0, r)
    return g
  }
  twoRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2
    g.ss(1).s(C.black)
    g.f(c[0]).rc(-d, 0, d2, d, r, r, 0, 0)
    g.f(c[1]).rc(-d, d, d2, d, 0, 0, r, r)
    return g
  }
  oneRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2
    g.ss(1).s(C.black)
    g.f(c[0]).rc(-d, 0, d2, d2, r, r, r, r)
    return g
  }
}
