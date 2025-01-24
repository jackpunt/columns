import { C } from "@thegraid/common-lib";
import { RectShape } from "@thegraid/easeljs-lib";
import { ColCard } from "./col-card";


export class CardShape extends RectShape {
  /**
   *
   * @param fillc base color of card
   * @param strokec [C.grey64] supply '' for no stroke
   * @param rad [ColCard.onScreenRadius] size of shorter side [longer is (rad * 1.4)]
   * @param portrait [false] height is shorter; true -> width is shorter
   */
  constructor(fillc = 'lavender', strokec = C.grey64, rad = ColCard.onScreenRadius, portrait = false,) {
    if (rad <= 1) rad = rad * ColCard.onScreenRadius;
    const r = 3.5 / 2.5; // length of long side relative to short side = 1.4
    const w = portrait ? rad : rad * r, h = portrait ? rad * r : rad;
    super({ x: -w / 2, y: -h / 2, w, h, r: Math.max(h, w) * .05, s: 0 }, fillc, strokec);
  }
}
