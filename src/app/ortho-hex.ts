import { C, type Constructor, type RC } from "@thegraid/common-lib";
import { type Paintable } from "@thegraid/easeljs-lib";
import { Hex1 as Hex1Lib, Hex2Mixin, HexMap, type Hex, type HexDir, type LINKS, TP as TPLib, type DCR, type TopoC, TopoOR4C, type DirDCR, type TopoXYWH } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import type { ColCard } from "./col-card";
import { TP } from "./table-params";
import type { DisplayObject } from "@thegraid/easeljs-module";

// Hex1 has get/set tile/meep -> _tile/_meep
// Hex2Mixin.Hex2Impl has get/set -> setUnit(unit, isMeep)
export class OrthoHex extends Hex1Lib {
  static topo = new TopoOR4C();

  get card() { return super.meep as ColCard | undefined }
  set card(card) { super.meep = card; }
}

class OrthoHex2Lib extends Hex2Mixin(OrthoHex) {};

export class OrthoHex2 extends OrthoHex2Lib {
  // override tile: PathTile | undefined; // uses get/set from Hex2Mixin(PathHex)
  // override meep: ColCard | undefined;

  // overide to inject OrthoHex.topo
  override xywh(radius = this.radius, topo: TopoC<DirDCR> = OrthoHex.topo, row = this.row, col = this.col) {
    return super.xywh(radius, topo, row, col);
  }
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

  override topo: TopoC<Partial<Record<HexDir, DCR>>, HexDir> = OrthoHex.topo;

  override xyFromMap(target: DisplayObject, row?: number, col?: number): TopoXYWH {
    return super.xyFromMap(target, row, col)
  }
  override makeAllHexes(nh = TP.nHexes, mh = TP.mHexes, rc0: RC) {
    const tp = TP, tpl = TPLib;
    // nh: rows, mh: cols
    return this.makeRect(nh, mh, false, false); // ignore return value hexary: Hex[]
  }
  override link(hex: OrthoHex2, rc?: RC, map?: OrthoHex2[][], nt = this.topo, lf?: ((hex: OrthoHex2) => LINKS<OrthoHex2>)): void {
    super.link(hex, rc, map, nt, lf)
  }

  /**
   * expect nt: Topo to be Record<Or4Dir,DCR> or Record<Or8Dir,DCR>
   */
  override nextRowCol(rc: RC, dir: HexDir, nt = this.topo): RC {
    return super.nextRowCol(rc, dir, nt)
  }
}
export type Or8Dir = Exclude<HexDir, 'EN' | 'WN' | 'ES' | 'WS'>; // 8 compass dirs
export type Or4Dir = Exclude<Or8Dir, 'NE' | 'NW' | 'SE' | 'SW'>; // 4 compass dirs

export function Or4Topo() {

}
