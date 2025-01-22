import { C } from "@thegraid/common-lib";
import { RectShape } from "@thegraid/easeljs-lib";
import { ColCard } from "./col-card";


export class CardShape extends RectShape {
  constructor(fillc = 'lavender', strokec = C.grey64, rad = ColCard.onScreenRadius, vert = false,) {
    const r = 3.5 / 2.5; // length of long side relative to short side = 1.4
    const w = vert ? rad : rad * r, h = vert ? rad * r : rad;
    super({ x: -w / 2, y: -h / 2, w, h, r: Math.max(h, w) * .05, s: 0 }, fillc, strokec);
  }
}
