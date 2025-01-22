import { C, type Constructor, type RC } from "@thegraid/common-lib";
import { RectShape, type Paintable } from "@thegraid/easeljs-lib";
import { H, Hex, Hex1 as Hex1Lib, Hex2Mixin, HexMap, LegalMark, TopoC, TP, type DCR, type DirDCR, type HexDir, type IHex2, type Tile, type TopoXYWH } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import type { ColCard } from "./col-card";


type Or4DCR = Record<Or4Dir, DCR>
export class TopoOR4C extends TopoC<Or4DCR> {
  constructor(public wr = 2.5, public hr = 1.75, public gap = .1) {
    super()
  }
  override _linkDirs = H.or4Dirs;
  topoDCR(rc: RC) {
    return { N: { dr: -1, dc: 0 }, E: { dr: 0, dc: 1 }, S: { dr: 1, dc: 0 }, W: { dr: 0, dc: -1 } };
  }
    /** a TopoMetric for graphical layout */
  override  xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const w = rad * this.wr, h = rad * this.hr;
    const dxdc = w + rad * this.gap, dydr = h + rad * this.gap;
    return { x: col * dxdc, y: row * dydr, w, h, dxdc, dydr }
  }
}

class DualLegalMark extends LegalMark {

  // allow to be on left or right side of ColCard (hex)
  override setOnHex(hex: IHex2, align: 'C' | 'L' | 'R' = 'C') {
    super.setOnHex(hex);
    // this.hex2 = hex;
    // this.doGraphics();
    const hex2 = hex as OrthoHex2;
    const card = this.hex2;
    const parent = hex2.mapCont.markCont;
    hex2.cont.parent.localToLocal(hex2.x, hex2.y, parent, this);
    this.hitArea = hex2.hexShape; // legal mark is used for hexUnderObject, so need to cover whole hex.
    this.mouseEnabled = true;
    this.visible = false;
    parent.addChild(this);
    return this;
  }
}


// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class OrthoHex extends Hex1Lib {
  static topo = new TopoOR4C(); // used by xywh() and HexMap

  _meep2: Tile | undefined;
  get meep2() { return this._meep2; }
  set meep2(meep: Tile | undefined) { this.setUnit(meep, true) }

  /** like occupied:
   *  @return [this.meep, this.meep2] | undefined
   */
  get meeps(): [Tile | undefined, Tile | undefined] | undefined { return (this.meep2 || this.meep) ? [this.meep, this.meep2] : undefined; }
  // user cannot drop meep on the cell/card; code will check hex.meeps()
  // and put them on correct cell/slot [so we are not re-doing unitCollision()]

  override setUnit(unit?: Tile, isMeep?: boolean | undefined): void {
    super.setUnit(unit, isMeep)
    if (!unit) return;
    const dxy = unit.radius / 4; // super.setUnit places unit a center of hex, offset it:
    if (unit === this.meep) {
      unit.x -= dxy; unit.y += dxy;
    } else if (unit === this.meep2) {
      unit.x += dxy; unit.y -= dxy;
    }
  }

  get card() { return super.tile as ColCard | undefined }
  set card(card) { super.tile = card; }
}

class OrthoHex2Lib extends Hex2Mixin(OrthoHex) {};

export class OrthoHex2 extends OrthoHex2Lib {
  // override tile: PathTile | undefined; // uses get/set from Hex2Mixin(PathHex)
  // override meep: ColCard | undefined;

  // overide to inject OrthoHex.topo
  override xywh(radius = this.radius, topo: TopoC<DirDCR> = OrthoHex.topo, row = this.row, col = this.col) {
    return super.xywh(radius, topo, row, col);
  }

  override makeHexShape(colorn = C.grey224): Paintable {
    return new CardShape(colorn);
  }

  // leave distText visible
  override showText(vis = !this.rcText.visible) {
    this.rcText.visible = vis;
    this.reCache();
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

  // override to makeRect
  override makeAllHexes(nh = TP.nHexes, mh = TP.mHexes, rc0: RC) {
    // nh: rows, mh: cols
    return this.makeRect(nh, mh, false, false); // ignore return value hexary: Hex[]
  }
  // working with GameSetup to color the 'HexShape' with a district per row:
  override paintDistrict(hex2Ary: IHex2[], district = 0, cColor?: string) {
    hex2Ary.forEach((hex, n) => {
      let dcolor = HexMap.distColor[hex.district ?? 0]
      hex.setHexColor(dcolor);
      hex.distText.color = C.pickTextColor(dcolor);
      hex.distText.visible = true;
      return;
    });
  }
  // inject district from row (also sets color)
  override addHex(row: number, col: number, district?: number, hexC?: Constructor<OrthoHex2>): OrthoHex2 {
    district = (row == 0) ? 0 : (TP.nHexes - row - 1); // compute district from row
    return super.addHex(row, col, district, hexC)
  }
}
export type Or8Dir = Exclude<HexDir, 'EN' | 'WN' | 'ES' | 'WS'>; // 8 compass dirs
export type Or4Dir = Exclude<Or8Dir, 'NE' | 'NW' | 'SE' | 'SW'>; // 4 compass dirs

export function Or4Topo() {

}
