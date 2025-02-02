import { C, type XY } from "@thegraid/common-lib";
import { NamedContainer, RectShape, type Paintable } from "@thegraid/easeljs-lib";
import { H, Tile, TileSource, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColMeeple } from "./col-meeple";
import { type GamePlay } from "./game-play";
import { OrthoHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";

export class ColCard extends Tile {
  // static get allCards() { return Array.from(this.cardByName.values()) }
  static allCards: ColCard[] = [];
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = ColCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = ColCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : ColCard.nextRadius }
  override get isMeep() { return false; }
  declare gamePlay: GamePlay;
  override get hex(): Hex1 { return super.hex as Hex1 }
  override set hex(hex: Hex1) { super.hex = hex }

  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE];

  constructor(aname: string, readonly faction = 0) {
    const Aname = aname.startsWith(':') ? `${ColCard.allCards.length}${aname}` : aname;
    const color = ColCard.factionColors[faction], tColor = C.pickTextColor(color);
    super(Aname);
    this.addChild(this.meepCont);
    this.nameText.color = tColor;
    this.setNameText(Aname, this.radius * .35);
    this.paint(color)
    ColCard.allCards.push(this);
  }

  meepCont = new NamedContainer('meepCont')
  _rank?: number; // set on first access; ASSERT cards don't move
  get rank() { return this._rank ?? (this._rank = ((this.hex.map as HexMap2).nRowCol[0] - this.hex.row - 1)) }
  get col() { return this.hex.col + 1 }

  // XY locs for meeples on this card. maxMeeps = meepleLocs.length
  // basic have 1 in center; DualCards have two offset; BlackCards have ~20
  get meepsOnCard() { return this.meepCont.children.filter(c => (c instanceof ColMeeple))}
  meepleLoc(ndx = this.openCells[0]): XY {
    return { x: 0, y: 0 }
  }
  /** when openCells[0] is undefined: */
  get bumpLoc() { return { x: -this.radius / 2, y: -this.radius / 3 } }

  get cellsInUse() {
    return this.meepsOnCard.map(meep => meep.cellNdx as number).sort((a, b) => a - b)
  }
  get maxCells() { return 1 }
  get openCells() {
    const rv: number[] = [], inUse = this.cellsInUse;
    for (let i = 0; i< this.maxCells; i++) {
      if (!inUse.includes(i)) rv.push(i);
    }
    return rv;
  }
  addMeep(meep: ColMeeple, cellNdx = this.openCells[0], xy?: XY) {
    const inUse = (cellNdx !== undefined) ? this.cellsInUse.includes(cellNdx) : true;
    const locXY = inUse ? this.bumpLoc : this.meepleLoc(cellNdx);
    this.meepCont.addChild(meep);
    meep.x = locXY.x; meep.y = locXY.y; meep._hex = this.hex;
    meep.card = this; meep.cellNdx = cellNdx; meep.faction = this.faction;
  }
  // not used? just move to another Card...
  rmMeep(meep: ColMeeple) {
    this.meepCont.removeChild(meep)
    meep.set({ x: 0, y: 0, card: undefined, cellNdx: undefined })
  }

  // invoked by constructor.super()
  override makeShape(): Paintable {
    return new CardShape('lavender', C.black, this.radius);
  }

  override reCache(scale?: number): void {
    super.reCache(0); // no cache?
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    return undefined;  //'Cards are not moveable'; // moveable, but markLegalHexes() --> 0
  }


  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    return (toHex === ctx.tile?.fromHex) && (ctx.lastShift ?? false);
  }

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    super.showTargetMark(hex, ctx)
  }

  /** how many of which Claz to construct & print: for TileExporter */
  static countClaz(n = 2) {
    return [].map(x => [n, ColCard, 750]) as CountClaz
  }

  // Sets of cards:
  // 1. ColTiles: tableau cards (nr: nHexes X nc: mHexes, some with 2 offices?) + black rows
  // shuffle and deal with gameSetup.placeCardsOnMap()
  // makePlayerBits: as buttons on playerPanel: (ankh: cardSelector ?)
  // three states: in-hand, committed bid, already played [reset to in-hand at player.newTurn()]
  // showCardSelector, revealCards?
  // impose a 'player turn' for GUI to reveal cards & select each player's bid
  // 'V' => forEachPlayer( showCardSelector(showing = !showing))
  // 2. for each Player - [1..nc] ColSelect cards
  // 3. for each Player - [1..nc-1 max 4] BidCoin cards

  static makeAllCards(nc = TP.mHexes, nr = TP.nHexes, nPlayers = 4, ) {
    ColCard.allCards.length = 0;
    // narrative: R:military, G:bankers, B:merchant, P:aristocrat
    const nCards = nc * nr, nFacs = 4;
    for (let n = -2 * nc; n < nCards; n += nFacs) {
      for (let fact = 1; fact <= nFacs; fact++) {
        const faction = n < 0 ? 0 : fact, aname = `:${faction}`;
        const card = (faction == 0) ? new BlackCard(aname) : new ColCard(aname, faction);
        if (faction > 0) {
          const f1 = faction, f2 = 1 + (Math.floor(n / nFacs) % nFacs);
          const dual = new DualCard(`${n+nCards}:${f1}&${f2}`, f1, f2);
        }
      }
    }
  }

  static source: TileSource<ColCard>;

  static makeSource(hex: IHex2) {
    const src = ColCard.makeSource0(TileSource<ColCard>, ColCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`;
    return src;
  }
}
class DualCard extends ColCard {
 override get maxCells() { return 2 }

  constructor(Aname: string, faction0: number, faction1: number) {
    super(Aname, faction0);
    this.factions = [faction0, faction1]
    this.dualColor();
  }
  factions: number[] =[]
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY): void {
    // meep on map.tileCont@(mx,my)
    // this on map.tileCont@(tx,ty); meepCont on this@(0,0)
    const pt = xy ?? meep.parent.localToLocal(meep.x, meep.y, this.meepCont)
    if (cellNdx === undefined) cellNdx = pt.x < 0 ? 0 : 1;
    super.addMeep(meep, cellNdx)
    meep.faction = this.factions[cellNdx];
    return;
  }
  override meepleLoc(ndx = this.openCells[0]): XY {
    const width = this.getBounds().width;
    return { x: width * (ndx - .5) / 2, y: 0 }
  }
  override get bumpLoc() { return { x: 0, y: -this.radius / 3 } }

  /** modify baseShape.cgf to paint 2 cells */
  dualColor(): Paintable {
    // retool a RectShape with 2 X drawRect(); sadly only the last one renders!
    const rv = this.baseShape as RectShape; // CardShape
    const [c1, c2] = this.factions.map(f => ColCard.factionColors[f])
    const { x, y, width, height } = rv.getBounds();
    const w2 = width / 2, rr = Math.max(width, height) * .05;
    rv._cgf = (colorn: string, g = rv.g0) => {
      g.s('black').ss(1);
      g.f(c1).rc(x, y, w2, height, rr, 0, 0, rr);
      g.f(c2).rc(0, y, w2, height, 0, rr, rr, 0);
      return g
    }
    this.paint('ignored'); // the given colorn is ignored by the cgf above
    return rv
  }
}

class BlackCard extends ColCard {
  override get maxCells() { return TP.numPlayers * 2 }

  constructor(Aname: string, faction = 0) {
    super(Aname, faction)
  }

  override meepleLoc(ndx = this.openCells[0]): XY {
    const { width, height } = this.getBounds();  // m2 ~= numPlayers
    const m2 = this.maxCells / 2, row = Math.floor(ndx / m2), col = ndx % m2;
    const dxdc = (width - 20) / m2, dydr = (height - 10) / 2;
    return { x: dxdc * (col - (m2 - 1) / 2), y: dydr * (row - .5) }
  }

  override get bumpLoc() { return { x: 0, y: 0 } } // should not happen...
}

/** CardShape'd "Hex" for placement of PathCard */
export class CardHex extends Hex2 {
  /** record all CardHex for PathCard.markLegal() */
  static allCardHex = [] as CardHex[];
  constructor(map: HexMap2, row = 0, col = 0, Aname = '') {
    super(map, row, col, Aname)
    CardHex.allCardHex.push(this);
  }

  override makeHexShape(colorn = C.grey224): Paintable {
    return new CardShape(colorn);
  }
}
