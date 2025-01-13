import { C, type Constructor } from "@thegraid/common-lib";
import { type Paintable } from "@thegraid/easeljs-lib";
import { Hex1 as Hex1Lib, Hex2Mixin, HexMap, type Hex } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import type { ColCard } from "./col-card";

// Hex1 has get/set tile/meep -> _tile/_meep
// Hex2Mixin.Hex2Impl has get/set -> setUnit(unit, isMeep)
export class OrthoHex extends Hex1Lib {
  get card() { return super.meep as ColCard | undefined }
  set card(card) { super.meep = card; }
}

class OrthoHex2Lib extends Hex2Mixin(OrthoHex) {};

export class OrthoHex2 extends OrthoHex2Lib {
  // override tile: PathTile | undefined; // uses get/set from Hex2Mixin(PathHex)
  // override meep: ColCard | undefined;
}

export class HexMap2 extends HexMap<OrthoHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<OrthoHex2> = OrthoHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
    this.cardMark = new CardShape(C.nameToRgbaString(C.grey128, .3), '');
    this.cardMark.mouseEnabled = false; // prevent objectUnderPoint!
  }
  /** the Mark to display on cardMarkhexes */
  cardMark: Paintable
  /** Hexes for which we show the CardMark */
  cardMarkHexes: Hex[] = []
  override showMark(hex?: Hex): void {
    const isCardHex = (hex && this.cardMarkHexes.includes(hex))
    super.showMark(hex, isCardHex ? this.cardMark : this.mark);
    if (!hex) this.cardMark.visible = false;
  }
}
