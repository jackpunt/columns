import { C } from "@thegraid/common-lib";
import { RectShape } from "@thegraid/easeljs-lib";
import { ColCard } from "./col-card";


export class CardShape extends RectShape {
  constructor(fillc = 'lavender', strokec = C.grey64, rad = ColCard.onScreenRadius) {
    const vert = false, r = 3.5 / 2.5; // r = 1.4
    const w = vert ? rad : rad * r, h = vert ? rad * r : rad;
    super({ x: -w / 2, y: -h / 2, w, h, r: h * .05, s: 0 }, fillc, strokec);
  }
}
