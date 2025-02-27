import { C, type Constructor, type RC } from "@thegraid/common-lib";
import { CircleShape, type Paintable } from "@thegraid/easeljs-lib";
import { H, Hex, Hex1 as Hex1Lib, Hex2Mixin, HexMap, LegalMark, TopoC, TP, type DCR, type DirDCR, type HexDir, type IHex2, type Tile, type TopoXYWH } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import type { ColCard } from "./col-card";
import type { ColMeeple } from "./col-meeple";


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

// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class OrthoHex extends Hex1Lib {
  static topo = new TopoOR4C(); // used by xywh() and HexMap

  _meep2: Tile | undefined;
  get meep2() { return this._meep2; }
  set meep2(meep: Tile | undefined) { this.setUnit(meep, true) }

  /** like 'occupied()':
   *  @return [this.meep, this.meep2] | undefined
   */
  get meeps(): [Tile | undefined, Tile | undefined] | undefined { return (this.meep2 || this.meep) ? [this.meep, this.meep2] : undefined; }
  // user cannot drop meep on the cell/card; code will check hex.meeps()
  // and put them on correct cell/slot [so we are not re-doing unitCollision()]

  // Mixin does not preserve types!
  get card() { return super.tile as ColCard }
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

  override makeLegalMark(): LegalMark {
    return new DualLegalMark()
  }
  declare legalMark: DualLegalMark;

  override setIsLegal(v: boolean, meep?: ColMeeple): boolean {
    if (v) {
      const cardFacs = this.card.factions;
      const bidFacs = meep?.player.curBidCard?.factions ?? [];
      const legalMark = this.legalMark;
      cardFacs.forEach((f, i) => legalMark.paint(i, bidFacs.includes(f)))
    }
    return super.setIsLegal(v);
  }
  // leave distText visible
  override showText(vis = !this.rcText.visible) {
    this.rcText.visible = vis;
    this.reCache();
  }

  override unitCollision(this_unit: Tile, unit: Tile, isMeep?: boolean): void {
    // multiple ColMeeple may point to the same hex.
    // we never use hex.meep; but rather hex.card.meepsOnCard
    if (isMeep) return
    debugger; // two ColCards assigned to same hex??
    return
  }
}


export class DualLegalMark extends LegalMark {
  declare children: Paintable[];
  // replace original legalMark with multiple circles
  doGraphicsDual(card: ColCard) {
    const xy = card.factions.map((f, i) => card.meepleLoc(i))
    const radius = this.hex2.radius * .27;
    this.removeAllChildren();
    xy.forEach(({ x, y }) => {
      const cs = new CircleShape(this.pc[1], radius, '');
      cs.x = x; cs.y = y;
      this.addChild(cs);
    })
  }
  pc = ['rgba(255,255,255,.7)', 'rgba(255,255,255,.3)']
  paint(i = 0, isBid = false) {
    this.children[i].paint(this.pc[isBid ? 0 : 1]);
  }
}


// Specific HexMap<OrthoHex2> for columns:
export class HexMap2 extends HexMap<OrthoHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<OrthoHex2> = OrthoHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
    this.cardMark = new CardShape(C.nameToRgbaString(C.grey224, .2), '', .85);
    this.cardMark.mouseEnabled = false; // prevent objectUnderPoint!
  }
  getCard(rank: number, col: number) {
    // ASSERT: minRow = 0; maxRow = nRows-1
    return this[this.maxRow as number - rank][col - 1].card;
  }
  /** the Mark to display on cardMarkhexes */
  cardMark: Paintable
  /** Hexes for which we show the CardMark */
  cardMarkHexes: Hex[] = []
  override showMark(hex?: Hex): void {
    const isCardHex = true;//(hex && this.cardMarkHexes.includes(hex))
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
      hex.distText.color = hex.rcText.color = C.pickTextColor(dcolor);
      hex.showText(true)
      return;
    });
  }
  // inject district from row (also sets color)
  override addHex(row: number, col: number, district?: number, hexC?: Constructor<OrthoHex2>): OrthoHex2 {
    district = (TP.nHexes - row - 1); // compute district from row
    return super.addHex(row, col, district, hexC)
  }
}
export type Or8Dir = Exclude<HexDir, 'EN' | 'WN' | 'ES' | 'WS'>; // 8 compass dirs
export type Or4Dir = Exclude<Or8Dir, 'NE' | 'NW' | 'SE' | 'SW'>; // 4 compass dirs

export function Or4Topo() {

}
