import { C, F, type XY } from "@thegraid/common-lib";
import { CenterText, NamedContainer, type CountClaz, type Paintable, type PaintableShape } from "@thegraid/easeljs-lib";
import { Text } from "@thegraid/easeljs-module";
import { Tile, TileSource, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColMeeple, ColSelButton } from "./col-meeple";
import { arrayN, nFacs, type Faction, type GamePlay } from "./game-play";
import { OrthoHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { Player } from "./player";
import { TP } from "./table-params";
// import type { CountClaz } from "./tile-exporter";

export class ColCard extends Tile {
  // static get allCards() { return Array.from(this.cardByName.values()) }
  static allCards: ColCard[] = [];
  static allCols: ColCard[] = [];

  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = CardShape.onScreenRadius; // when super() -> this.makeShape()
  _radius = ColCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : ColCard.nextRadius }
  override get isMeep() { return false; }
  declare gamePlay: GamePlay;
  override get hex(): Hex2 { return super.hex as Hex2 }
  override set hex(hex: Hex1) { super.hex = hex }

  static candyColors = [C.BLACK, '#FF0000', '#ebb000', '#0066FF', '#9900CC', C.WHITE];
  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE, C.WHITE];
  factions: Faction[] = [0];

  constructor(aname: string, ...factions: Faction[]) {
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

  /**
   * @param dir 1: up, -1: down, -2: down-2
   */
  nextCard(dir: 1 | -1 | -2): ColCard {
    return dir == 1 ? this.hex.nextHex('N')?.card ?? this.hex.card
        : dir == -1 ? this.hex.nextHex('S')?.card ?? this.hex.card
        : dir == -2 ? this.nextCard(-1).nextCard(-1)
        : this.hex.card
  }
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
   * add meep to this ColCard in cellNdx, at meepleLoc or bumpLoc
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

  static makeAllCards(nr = TP.nHexes, nc = TP.mHexes, ) {
    ColCard.allCards.length = 0;
    const nCards = nc * nr ; // number of factions

    BlackCard.seqN = 0;
    BlackCard.allBlack = arrayN(nc * 2).map(i => new BlackCard(`:0`, nc));

    ColCard.allCols = arrayN(nCards).map(n => {
      const fact = 1 + (n % nFacs) as Faction, aname = `:${fact}`;
      return new ColCard(aname, fact);
    })

    DualCard.allDuals = arrayN(nFacs * nFacs).map(n => {
      const n4 = Math.floor(n / nFacs)
      const f1 = 1 + (n % nFacs) as Faction, f2 = 1 + (n4 % nFacs) as Faction;
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
  declare baseShape: CardShape;

  constructor(Aname: string, faction0: Faction, faction1: Faction) {
    super(Aname, faction0, faction1);
    this.baseShape.dualCgf(C.BLACK, ...[faction0, faction1].map(f => ColCard.factionColors[f]));
    this.paint('ignored')
  }

  // determine if meep was dropped on left or right cell
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY) {
    // meep on map.tileCont@(mx,my)
    // this on map.tileCont@(tx,ty); meepCont on this@(0,0)
    const pt = xy ?? meep.parent?.localToLocal(meep.x, meep.y, this.meepCont);
    if (cellNdx === undefined && pt !== undefined) cellNdx = (pt.x <= 0 ? 0 : 1);
    if (cellNdx === undefined) cellNdx = this.openCells[0];
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
}

export class BlackCard extends ColCard {
  override get maxCells() { return TP.numPlayers * 2 }

  static allBlack: BlackCard[] = [];
  static seqN = 0;
  static countClaz(n = 0): CountClaz[] {
    return [[n, PrintBlack, 'BlackCard', n, .5]]
  }

  constructor(Aname: string, seqLim = 0, fs = .5) {
    super(Aname, 0) // initial factions[] for painting color
    this.factions = arrayN(this.maxCells, i => 0) as Faction[];
    const colNum = BlackCard.seqN = (BlackCard.seqN >= seqLim ? 0 : BlackCard.seqN) + 1;
    const colName = ColSelButton.colNames[colNum];
    const colId = new CenterText(`${seqLim > 0 ? colName : ''}`, Math.round(this.radius * fs), C.WHITE,)
    colId.y = colId.y = this.radius * (.5 - .48 * fs)
    this.addChildAt(colId, 1); // under meepCont
  }

  override meepleLoc(ndx = this.openCells[0]): XY {
    const { width, height } = this.getBounds();  // m2 ~= numPlayers
    const m2 = this.maxCells / 2, row = Math.floor(ndx / m2), col = ndx % m2;
    const dxdc = (width - 20) / m2, dydr = (height - 10) / 2;
    return { x: dxdc * (col - (m2 - 1) / 2), y: dydr * (row - .5) }
  }

  override get bumpLoc() { return { x: 0, y: 0 } } // should not happen...
}

export class PrintCol extends ColCard {
  static seqN = 0;
  /** how many of which Claz to construct & print: for TileExporter */
  static countClaz(n = 1): CountClaz[] {
    return [[n, PrintCol]]
  }

  constructor(allCards = ColCard.allCols) {
    ColCard.nextRadius = 525
    if (PrintCol.seqN  >= allCards.length) PrintCol.seqN = 0
    const n = PrintCol.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, ...factions);
    ColCard.allCards.pop();
    ;(this.baseShape as PaintableShape).colorn = C.BLACK; // set for bleed.color
    return;
  }
}
export class PrintDual extends DualCard {
  static seqN = 0;
  static countClaz(n = 20): CountClaz[] {
    return [[n, PrintDual]];
  }
  constructor(allCards = DualCard.allDuals) {
    ColCard.nextRadius = 525
    if (PrintDual.seqN >= allCards.length) PrintDual.seqN = 0
    const n = PrintDual.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, factions[0], factions[1]);
    ColCard.allCards.pop();
  }
}

export class PrintBlack extends BlackCard {
  constructor(Aname: string, seqLim = 0, fs?: number) {
    ColCard.nextRadius = 525
    super(Aname, seqLim, fs)
    ColCard.allCards.pop();
  }
}

export class SetupCard extends ColCard {
  constructor(text = '', size = 525) {
    ColCard.nextRadius = size;
    super(`Setup`, 5 as Faction)
    this.addChild(new CenterText(text, 150, ))
    this.paint(C.WHITE)
  }
  override makeShape(): Paintable {
    return new CardShape(C.WHITE, '', this.radius, false, 0)
  }
  override get bleedColor(): string { return C.WHITE }
}


export class SummaryCard extends ColCard {
  constructor(size = 525, fs = size / 8) {
    ColCard.nextRadius = size;
    super('per Round:', 5)
    const l: string[] = []
     l[0] = `3 x Turns:`;
     l[1] = '  Select Column & Bid'
     l[2] = '  Resolve & Advance'
     l[3] = '  Bump & Cascade'
     l[4] = '  Score for Color'
     l[5] = 'Then: Score for Rank'
    const text = l.join('\n')
    const elt = new Text(text, F.fontSpec(fs));
    elt.textAlign = 'left';
    this.addChild(elt);
    const { x, y, width, height } = elt.getBounds()
    elt.x = -width / 2;
    elt.y = -height / 2;
    this.paint(C.WHITE, true)

  }
  override makeShape(): Paintable {
    return new CardShape('lavender', C.WHITE, this.radius);
  }
}

