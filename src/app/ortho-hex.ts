import { C, type Constructor, type RC } from "@thegraid/common-lib";
import { CircleShape, type Paintable } from "@thegraid/easeljs-lib";
import { Hex, Hex1 as Hex1Lib, Hex2Mixin, HexMap, LegalMark, TopoC, TopoEWC, TopoOR4C as TopoOR4CLib, type DCR, type DirDCR, type HexDir, type IHex2, type Tile, type TopoXYWH } from "@thegraid/hexlib";
import type { ColId } from "./card-button";
import { CardShape } from "./card-shape";
import type { ColCard } from "./col-card";
import type { ColMeeple } from "./col-meeple";
import { TP } from "./table-params";


/** 4-connected topo (N,E,S,W) for rectangular baseshape.
 *
 * this application is functionally 2-connected: not using (E, W) links.
 */
export class TopoRect4C extends TopoOR4CLib {
  static topo = new TopoRect4C();  // a singleton instance used by HexMap (& xywh())

  /** asymetrical radius: wr by hr */
  constructor(public wr = 2.5, public hr = 1.75, public gap = .1) {
    super()
  }

    /** a TopoMetric for graphical layout */
  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const w = rad * this.wr, h = rad * this.hr;
    const dxdc = w + rad * this.gap, dydr = h + rad * this.gap;
    return { x: col * dxdc, y: row * dydr, w, h, dxdc, dydr }
  }
}

// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
/** Rectangular Hex with a Card */
export class RectHex extends Hex1Lib {
  // static topoOR4C = new TopoOR4C(); // a static instance used by xywh() and HexMap

  /** alias for this.tile; card has meepsOnCard, based on maxCells & cellNdx */
  // Mixin does not preserve types!
  get card() { return super.tile as ColCard }
  set card(card) { super.tile = card; }

  /** easy reference from Hex -> card.isInCol() */
  isInCol(colId: ColId) {
    return this.card?.isInCol[colId] ?? false
  }
}

class RectHex2Mixed extends Hex2Mixin(RectHex) {};

/** RectHex2 for Cards stacked in columns.
 *
 * for this application, we put the Meeples on the Card.
 * The Hex never sees them; so we don't need a meep[] or worry about collisions.
 */
export class RectHex2 extends RectHex2Mixed {
  // override tile: PathTile | undefined; // uses get/set from Hex2Mixin(PathHex)
  // override meep: ColCard | undefined;

  // overide to inject OrthoHex.topo
  override xywh(radius = this.radius, topo: TopoC<DirDCR> = this.map.topo, row = this.row, col = this.col) {
    return super.xywh(radius, topo, row, col);
  }

  /** Hex2 include GUI and a Paintable DisplayObject */
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

/**
 * Rectangular Card/BaseShape on a TopoEW Hex grid (odd-rows shift right).
 *
 * For Pyramid: use (NW,NE, SW,SE) for links; no E/W
 */
export class RectTopoEWC extends TopoEWC {
  static topo = new RectTopoEWC();
  constructor(public wr = 2.5, public hr = 1.75, public gap = .1 ) {
    super()
  }

  /** Topo metric for Hex layout: odd-rows shift right */
  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const w = rad * this.wr, h = rad * this.hr;
    const dxdc = w + rad * this.gap, dydr = h + rad * this.gap;
    const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
    const y = (row) * dydr;   // dist between rows
    return { x, y, w, h, dxdc, dydr }
  }
}


export class ColHex2 extends RectHex2 {}

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
export class HexMap2 extends HexMap<ColHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<ColHex2> = ColHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
    this.cardMark = new CardShape(C.nameToRgbaString(C.grey224, .2), '', .85);
    this.cardMark.mouseEnabled = false; // prevent objectUnderPoint!
    this.topo = TP.usePyrTopo ? RectTopoEWC.topo : TopoRect4C.topo;
  }
  getCard(rank: number, col: number) {
    // ASSERT: minRow = 0; maxRow = nRows-1
    return this[this.maxRow as number - rank][col]?.card;
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
  get centerMap() {
    const row = (((this.maxRow ?? 0) + (this.minRow ?? 0)) / 2);
    const col = (((this.minCol ?? 0) + (this.maxCol ?? 0)) / 2);
    return { row, col }
  }
  override topo: TopoC<Partial<Record<HexDir, DCR>>, HexDir>;

  // makeAllDistricts() -> makeAllHexes()
  // override to makeRect
  override makeAllHexes(nr = TP.nHexes, nc = TP.mHexes, rc0: RC) {
    const col = 1, district = 0, hexAry = [] as ColHex2[];
    const np = TP.numPlayers;
    if (TP.usePyrTopo) {
      // see GameSetup.setRowsCols()
      //  6, 5, 4,5,3,2,1, 0
      const topoEW = new RectTopoEWC(1, 1, 0);
      const nru = (np < 3 ? 2 : 3), nrl = nr - nru;       // row with most (nc) columns == (nr-1) - 2
      const mcl = 4 + nru, trl = (np == 3) ? 5 : 4;
      // Note: when nrl is ODD, everything shifts right by 1/2 col!
      for (let row = 0; row < nr; row++) {
        const dnrl = Math.abs(nrl - row); // distance from nrl
        const ncr = (row == 0) ? trl : (mcl - dnrl); // num cols in row
        const ncc = (row == 0) ? dnrl - ncr / 2 : dnrl; // c0 inset
        const kx = Math.floor(topoEW.xywh(1, row - 1, ncc / 2).x);
        // console.log(stime(this, `.mAH:`), { row, dnrl, ncr, kx })
        this.addLineOfHex(ncr, row, kx, district, hexAry, 1)
      }
    } else {
      // nh: rows, mh: cols
      for (let row = 0; row < nr; row++) {
        this.addLineOfHex(nc, row, col, district, hexAry, 1)
      }
    }
    this.setDistrictAndPaint(hexAry)
    return hexAry;
    // return this.makeRect(nh, mh, false, false); // ignore return value hexary: Hex[]
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
  override addHex(row: number, col: number, district?: number, hexC?: Constructor<ColHex2>): ColHex2 {
    district = (TP.nHexes - row - 1); // compute district == RANK from row
    return super.addHex(row, col, district, hexC)
  }
}
