import { C, F, type XY } from "@thegraid/common-lib";
import { NamedContainer, RectShape, type Paintable, type PaintableShape } from "@thegraid/easeljs-lib";
import { H, Tile, TileSource, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColMeeple } from "./col-meeple";
import { arrayN, type GamePlay } from "./game-play";
import { OrthoHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";
import { Text } from "@thegraid/easeljs-module";

export class ColCard extends Tile {
  // static get allCards() { return Array.from(this.cardByName.values()) }
  static allCards: ColCard[] = [];
  static allCols: ColCard[] = [];
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

  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE, C.WHITE];
  factions = [0];
  get faction() { return this.factions[0] }

  constructor(aname: string, ...factions: number[]) {
    const Aname = aname.startsWith(':') ? `${ColCard.allCards.length}${aname}` : aname;
    super(Aname);
    this.factions = factions
    this.addChild(this.meepCont);
    const color = ColCard.factionColors[factions[0]], tColor = C.pickTextColor(color);
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
  meepleLoc(ndx = this.openCells[0]): XY {
    return { x: 0, y: 0 }
  }
  /** when openCells[0] is undefined: */
  get bumpLoc() { return { x: -this.radius / 2, y: -this.radius / 3 } }

  get meepsOnCard() { return this.meepCont.children.filter(c => (c instanceof ColMeeple))}
  /** for each meep on this card, include the cell it is in. ASSERT: each meep has unique cellNdx */
  get cellsInUse() {
    return this.meepsOnCard.map(meep => meep.cellNdx as number).sort((a, b) => a - b)
  }
  get maxCells() { return 1 }
  /** complement of cellsInUse */
  get openCells() {
    const inUse = this.cellsInUse;
    return arrayN(this.maxCells).filter(i => !inUse.includes(i))
  }
  otherMeepInCell(meep: ColMeeple, cellNdx?: number) {
    return this.meepsOnCard.find(m => (m !== meep) && (m.cellNdx == cellNdx))
  }
  /**
   * add meep to this ColCard in cellNdx or bumpLoc
   * @param meep
   * @param cellNdx target cell for meep (if supplied by DualCard)
   * @param xy (supplied by dropFunc -> DualCard)
   * @returns true if meep is in meepleLoc; false if in bumpLoc
   */
  addMeep(meep: ColMeeple, cellNdx = this.openCells[0], xy?: XY) {
    const toBump = (cellNdx == undefined) || !!this.otherMeepInCell(meep, cellNdx);
    const locXY = toBump ? this.bumpLoc : this.meepleLoc(cellNdx); // meepleLoc IFF cellNdx supplied and cell is empty
    this.meepCont.addChild(meep);
    meep.x = locXY.x; meep.y = locXY.y; meep._hex = this.hex;
    meep.card = this;
    meep.cellNdx = toBump ? undefined : cellNdx;
    // toBump -> undefined; BumpAndCascade -> meeplesToCell will addMeep() and resolve
    meep.faction = this.factions[cellNdx];
    return !toBump;
  }
  /**
   *
   * @returns true if meep is in meepleLoc; false if in bumpLoc
   */
  isBumpLoc(meep: ColMeeple) {
    return (meep.y == this.bumpLoc.y)
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

  static makeAllCards(nc = TP.mHexes, nr = TP.nHexes, ) {
    ColCard.allCards.length = 0;
    const nCards = nc * nr, nFacs = 4; // number of factions

    BlackCard.seqN = 0;
    BlackCard.allBlack = arrayN(nc * 2).map(i => new BlackCard(`:0`, nc));

    ColCard.allCols = arrayN(nCards).map(n => {
      const fact = 1 + (n % nFacs), aname = `:${fact}`;
      return new ColCard(aname, fact);
    })

    DualCard.allDuals = arrayN(nCards).map(n => {
      const n4 = Math.floor(n / nFacs)
      const f1 = 1 + (n % nFacs), f2 = 1 + (n4 % nFacs);
      return new DualCard(`${n + nCards}:${f1}&${f2}`, f1, f2);
    })
  }

  static source: TileSource<ColCard>;

  static makeSource(hex: IHex2) {
    const src = ColCard.makeSource0(TileSource<ColCard>, ColCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`;
    return src;
  }
}

export class DualCard extends ColCard {
  static allDuals: DualCard[] = []

  override get maxCells() { return 2 }

  constructor(Aname: string, faction0: number, faction1: number) {
    super(Aname, faction0, faction1);
    this.dualColor();
  }

  // determine if meep was dropped on left or right cell
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY) {
    // meep on map.tileCont@(mx,my)
    // this on map.tileCont@(tx,ty); meepCont on this@(0,0)
    const pt = xy ?? meep.parent.localToLocal(meep.x, meep.y, this.meepCont)
    if (cellNdx === undefined) cellNdx = (pt.x <= 0 ? 0 : 1);
    const rv = super.addMeep(meep, cellNdx)
    if (!rv) {
      meep.x += (cellNdx - .5) * .33 * this.cellWidth; // adjust bumpLoc: record desired cellNdx
    }
    return rv
  }
  get cellWidth() { return this.getBounds().width }
  override meepleLoc(ndx = this.openCells[0]): XY {
    return { x: this.cellWidth * (ndx - .5) / 2, y: 0 }
  }
  override get bumpLoc() { return { x: 0, y: -this.radius / 3 } }

  /** modify baseShape.cgf to paint 2 cells */
  dualColor(): Paintable {
    // retool a RectShape with 2 X drawRect(); sadly only the last one renders!
    const rv = this.baseShape as RectShape; // CardShape
    const [c1, c2] = this.factions.map(f => ColCard.factionColors[f])
    // h0 = rad - 2 * (.04 * rad) = .92*rad
    const { w: w0, h: h0 } = rv._rect, rad = h0 / .92;
    const s = rad * .04;
    const w = w0 + s, h = h0 + s;
    const w2 = w / 2, rr = Math.max(w0, h0) * .05;
    rv._cgf = (colorn: string, g = rv.g0) => {
      g.s('black').ss(s);
      g.f(c1).rc(-w2, -h / 2, w2, h, rr, 0, 0, rr);
      g.f(c2).rc(0  , -h / 2, w2, h, 0, rr, rr, 0);
      return g
    }
    this.paint('ignored'); // the given colorn is ignored by the cgf above
    return rv
  }
}

export class BlackCard extends ColCard {
  override get maxCells() { return TP.numPlayers * 2 }

  static allBlack: BlackCard[] = [];
  static seqN = 0;
  static countClaz(n = 0): CountClaz[] {
    return [[n, DupBlack, 'BlackCard', n]]
  }

  constructor(Aname: string, seqLim = 0) {
    super(Aname, 0) // initial factions[] for painting color
    this.factions = arrayN(this.maxCells, i => 0);
    const colNum = BlackCard.seqN = (BlackCard.seqN >= seqLim ? 0 : BlackCard.seqN) + 1;
    const colId = new Text(`${colNum}`, F.fontSpec(this.radius * .2), C.WHITE,)
    colId.y = this.radius * .3;
    this.addChild(colId)
  }

  override meepleLoc(ndx = this.openCells[0]): XY {
    const { width, height } = this.getBounds();  // m2 ~= numPlayers
    const m2 = this.maxCells / 2, row = Math.floor(ndx / m2), col = ndx % m2;
    const dxdc = (width - 20) / m2, dydr = (height - 10) / 2;
    return { x: dxdc * (col - (m2 - 1) / 2), y: dydr * (row - .5) }
  }

  override get bumpLoc() { return { x: 0, y: 0 } } // should not happen...
}

export class DupCard extends ColCard {
  static seqN = 0;
  /** how many of which Claz to construct & print: for TileExporter */
  static countClaz(n = 1): CountClaz[] {
    return [[n, DupCard]]
  }

  constructor(allCards = ColCard.allCols) {
    ColCard.nextRadius = 525
    if (DupCard.seqN  >= allCards.length) DupCard.seqN = 0
    const n = DupCard.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, ...factions);
    ColCard.allCards.pop();
    ;(this.baseShape as PaintableShape).colorn = C.BLACK; // set for bleed.color
    return;
  }
}
export class DupDual extends DualCard {
  static seqN = 0;
  static countClaz(n = 20): CountClaz[] {
    return [[n, DupDual]];
  }
  constructor(allCards = DualCard.allDuals) {
    ColCard.nextRadius = 525
    if (DupDual.seqN >= allCards.length) DupDual.seqN = 0
    const n = DupDual.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, factions[0], factions[1]);
    ColCard.allCards.pop();
  }
}

export class DupBlack extends BlackCard {
  constructor(Aname: string, seqLim = 0) {
    ColCard.nextRadius = 525
    super(Aname, seqLim)
    ColCard.allCards.pop();
  }
}
