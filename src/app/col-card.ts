import { C, F, type XY } from "@thegraid/common-lib";
import { CenterText, NamedContainer, type CountClaz, type Paintable, type PaintableShape } from "@thegraid/easeljs-lib";
import { Text } from "@thegraid/easeljs-module";
import { Tile, TileSource, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { ColSelButton, FacShape, type ColId } from "./card-button";
import { CardShape } from "./card-shape";
import { ColMeeple } from "./col-meeple";
import { arrayN, nFacs, type BumpDir, type BumpDir2, type Faction, type GamePlay } from "./game-play";
import { GameSetup } from "./game-setup";
import { ColHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { Player } from "./player";
import { TP } from "./table-params";
// import type { CountClaz } from "./tile-exporter";

export class ColCard extends Tile {

  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = CardShape.onScreenRadius; // when super() -> this.makeShape()
  _radius = ColCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : ColCard.nextRadius }
  override get isMeep() { return false; }
  declare gamePlay: GamePlay;
  override get hex(): Hex2 { return super.hex as Hex2 }
  override set hex(hex: Hex1) { super.hex = hex }
  declare baseShape: CardShape;

  static candyColors = [C.BLACK, '#FF0000', '#ebb000', '#0066FF', '#9900CC', C.WHITE];
  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE, C.WHITE];
  factions: Faction[] = [0];
  maxCells: number;

  constructor(aname: string, ...factions: Faction[]) {
    super(aname);
    this.factions = factions;
    this.maxCells = factions.length;
    this.addChild(this.meepCont);
    const color = ColCard.factionColors[factions[0]], tColor = C.pickTextColor(color);
    this.nameText.color = tColor;
    this.setNameText(aname, this.radius * .35);
    this.paint(color)
  }

  meepCont = new NamedContainer('meepCont')
  get rank() { return this.hex.district! } // ASSERT: district is set to rank
  get col() { return this.hex.col }

  setLabel(colId: string, fs = .5, color = C.pickTextColor(this.baseShape.colorn)) {
    const label = new CenterText(`${colId}`, Math.round(this.radius * fs), color,)
    label.y = label.y = this.radius * (.5 - .48 * fs)
    this.addChildAt(label, 1); // under meepCont
  }
  /** true if this Card can be accessed from given ColId (ColBidSelector)
   *
   * set by GamePlay.labelCardCols()
   */
  isInCol: Partial<Record<ColId, boolean>> = {};
  isDead: boolean = false;

  /**
   * Note: BlackCard overrides, returns ?? this
   * @param dir 'N': up, 'S': down, 'SS': down-2
   * @returns
   */
  nextCard(dir: BumpDir2): ColCard | undefined {
    if (dir !== 'SS') {
      if (TP.usePyrTopo && dir.length < 2) debugger;
      // single bump may return undefined when TP.usePyrTopo
      const next = this.hex.nextHex(dir)?.card;
      return (next && next.maxCells > 0) ? next : undefined; // BlackNull as undefined
    }
    // handle case of 'SS': returns target card or single step or this
    if (!TP.usePyrTopo) {
      return this.nextCard('S')!.nextCard('S')!; // black cards will return self
    } else {
      const { row, col } = this.hex; // 'SS' for usePyrTopo
      const next = (this.hex.map as HexMap2)[row + 2]?.[col]?.card;
      return (next && next.maxCells > 0) ? next : undefined; // BlackNull as undefined
      // when 'SS' fails, caller should try 'SW', 'SE'
    }
    BlackCard; BlackNull;
  }
  // XY locs for meeples on this card. maxMeeps = meepleLocs.length
  // basic have 1 in center; DualCards have two offset; BlackCards have ~20
  meepleLoc(ndx = this.openCells[0]): XY {
    return { x: 0, y: 0 }
  }
  /** when openCells[0] is undefined: */
  get bumpLoc() { return { x: -this.radius / 2, y: -this.radius / 3 } }

  /** for parseScenario, clear card so addMeep() does the right thing */
  rmAllMeeps() { this.meepCont.removeAllChildren() }
  /** the meepCont children (which are ColMeeple) */
  get meepsOnCard() { return this.meepCont.children.filter(c => (c instanceof ColMeeple))}
  /** meepsOnCard aligned with cellNdx, include meep(s) on bumpLoc */
  get meepsAtNdx() {
    const cardMeeps = this.meepsOnCard;
    return arrayN(this.maxCells)
      .map(ndx => cardMeeps.filter(meep => meep.cellNdx == ndx))
  }

  /** first meep in each cellNdx; pro'ly not on bumpLoc */
  get meepAtNdx() {
    const cardMeeps = this.meepsOnCard;
    return arrayN(this.maxCells).map(ndx => cardMeeps.find(meep => meep.cellNdx == ndx))
  }

  get meepStr() {
    return this.meepAtNdx
      .map(meep => meep ? `${meep.player.index}` : `-`)
      .join(' ')
      .padStart(2).padEnd(3)
  }

  /** all cellNdx with a meep */
  get cellsInUse() {
    const meeps = this.meepsOnCard;
    return arrayN(this.maxCells).filter(ndx => meeps.find(meep => meep.cellNdx == ndx))
  }
  /** all cellNdx with no meep */
  get openCells() {
    const meeps = this.meepsOnCard;
    return arrayN(this.maxCells).filter(ndx => !meeps.find(meep => meep.cellNdx == ndx))
  }
  otherMeepInCell(meep: ColMeeple, cellNdx = meep.cellNdx) {
    return this.meepsOnCard.find(m => (m !== meep) && (m.cellNdx == cellNdx))
  }
  /**
   * add meep to this ColCard in cellNdx, at meepleLoc or bumpLoc
   * @param meep
   * @param cellNdx target cell for meep (if supplied by DualCard or openCells[0])
   * @param xy coordinates on this card (supplied by dropFunc -> DualCard)
   * @returns other meeple in cell; if none, meep is in meepleLoc, else meep is in bumpLoc.
   */
  // makeMeeple: always an openCell; cellNdx: number
  //
  // dropFunc: addMeep(meep, undefined, xy); cellNdx: undefined -> openCell[0]
  // player.bumpMeeple: player has chosen a callNdx
  //
  // meeplesToCell: meep.cellNdx:? number --> openCell[0]: number
  addMeep(meep: ColMeeple, cellNdx = this.openCells[0] ?? 0, xy?: XY) {
    // use ?? 0; b/c dualCell will parse xy->cellNdx[0..1]; must be a single-cell
    const toBump = this.otherMeepInCell(meep, cellNdx);
    const locXY = !toBump ? this.meepleLoc(cellNdx)
      : this.isBumpLoc(toBump) ? this.meepleLoc(cellNdx) : this.bumpLoc;
    this.meepCont.addChild(meep);
    if (!this.hex) debugger; // this Card must be on a hex!
    meep.x = locXY.x; meep.y = locXY.y; meep._hex = this.hex; // no collisions, but fromHex
    meep.card = this;
    meep.cellNdx = cellNdx; // undefined if no openCell
    meep.fromHex = this.hex;   // for later use as fromHex?
    meep.faction = (cellNdx == undefined) ? undefined : this.factions[cellNdx];
    return toBump;
  }

  atBumpLoc() {
    const meeps = this.meepsOnCard.filter(meep => this.isBumpLoc(meep));
    if (meeps.length > 1) debugger;
    return meeps[0] as ColMeeple | undefined;
  }

  /**
   *
   * @returns true if meep is in bumpLoc; false if in meepleLoc
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
  // 1. ColCard: tableau cards (nr: nHexes X nc: mHexes, some with 2 offices) + black rows
  // shuffle and deal with gameSetup.placeCardsOnMap()
  // makePlayerBits: as buttons on playerPanel: (ankh: cardSelector ?)
  // three states: in-hand, committed bid, already played [reset to in-hand at player.newTurn()]
  // showCardSelector, revealCards?
  // impose a 'player turn' for GUI to reveal cards & select each player's bid
  // 'V' => forEachPlayer( showCardSelector(showing = !showing))
  // 2. for each Player - [1..nc] ColSelect cards
  // 3. for each Player - [1..nc-1 max 4] BidCoin cards

  static makeAllCards(nr = TP.nHexes, nc = TP.mHexes, ) {
    const nCards = TP.cardsInPlay ; // number of ColCards (nc*nr or 31/28)

    let nb = 0;
    const ncb = TP.usePyrTopo && !TP.fourBase ? Math.max(nc, 5) : nc; // maybe extra col in bottom row
    const black0 = arrayN(ncb, 1).map(i => new BlackCard(`${nb++}:0`, i)); // row 0
    const blackN = arrayN(ncb, 1).map(i => new BlackCard(`${nb++}:0`, i)); // row N (rank-0)

    const allCols = arrayN(nCards).map(n => {
      const fact = 1 + (n % nFacs) as Faction, aname = `${n}:${fact}`;
      return new ColCard(aname, fact);
    })

    const allDuals = arrayN(nFacs * nFacs).map(n => {
      const n4 = Math.floor(n / nFacs)
      const f1 = 1 + (n % nFacs) as Faction, f2 = 1 + (n4 % nFacs) as Faction;
      return new DualCard(`${n + nCards}:${f1}&${f2}`, f1, f2);
    })

    return { black0, blackN, allCols, allDuals }
  }

  static source: TileSource<ColCard>;

  static makeSource(hex: IHex2) {
    const src = ColCard.makeSource0(TileSource<ColCard>, ColCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`;
    return src;
  }
}

export class DualCard extends ColCard {

  declare baseShape: CardShape;

  constructor(Aname: string, faction0: Faction, faction1: Faction) {
    super(Aname, faction0, faction1);
    this.baseShape.dualCgf(C.BLACK, ...[faction0, faction1].map(f => ColCard.factionColors[f]));
    this.paint('ignored')
  }

  // makeMeeple: always an openCell; cellNdx: number
  // dropFunc: addMeep(meep, undefined, xy); cellNdx: undefined -> openCell[0]
  // meeplesToCell: meep.cellNdx:? number (meep.faction !== 0; could be undefined!)
  // player.bumpMeeple: player has chosen a cellNdx

  // determine if meep was dropped on left or right cell
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY) {
    // meep on map.tileCont@(mx,my)
    // this on map.tileCont@(tx,ty); meepCont on this@(0,0)
    const pt = xy ?? meep.parent?.localToLocal(meep.x, meep.y, this.meepCont);
    if (cellNdx === undefined && pt !== undefined) cellNdx = (pt.x <= 0 ? 0 : 1);
    if (cellNdx === undefined) cellNdx = this.openCells[0]// as number | undefined;
    // when meeplesToCell is invoked, should be an open cell, b/c bumpee was moved.
    const rv = super.addMeep(meep, cellNdx)
    if (rv) {
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

  static countClaz(n = 0): CountClaz[] {
    return arrayN(n).map(colNum => [1, PrintBlack, 'BlackCard', colNum, .5])
  }

  constructor(Aname: string, colNum = 0, fs?: number, nCells = TP.numPlayers) {
    nCells = Math.max(4, nCells + (nCells % 2)); // must be > 2, to distinguish from DualCard
    const factions = arrayN(nCells, i => 0) as Faction[];
    super(Aname, ...factions) // initial factions[] for painting color
    const colId = this._colId = ColSelButton.colNames[colNum];
    this.setLabel(colId, fs)
  }
  _colId: ColId;
  get colId() { return this._colId; }

  override nextCard(dir: BumpDir): ColCard | undefined {
    // Advance: only bottom have 'N'; bump: never a collision on Black
    if (!this.colId) return this;  // BlackFill (override 'N') --> no way out;
    return super.nextCard(dir) ?? this; // back to itself
  }

  override get meepStr() {
    return this.meepAtNdx.slice(0, 3)
      .map(meep => meep ? `${meep.player.index}` : `-`)
      .join('')
      .padStart(2).padEnd(3)
  }

  override meepleLoc(ndx = this.openCells[0]): XY {
    const { width, height } = this.getBounds();  // m2 ~= numPlayers
    const m2 = this.maxCells / 2, row = Math.floor(ndx / m2), col = ndx % m2;
    const dxdc = (width - 20) / m2, dydr = (height - 10) / 2;
    return { x: dxdc * (col - (m2 - 1) / 2), y: dydr * (row - .5) }
  }

  override get bumpLoc() { return { x: 0, y: 0 } } // should not happen...

  override otherMeepInCell(meep: ColMeeple, cellNdx?: number | undefined): ColMeeple | undefined {
    return undefined; // never a collision, blackCard will make a new cellNdx as needed.
  }

  // if occupied: ignore given cellNdx, dump in first empty cell
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY): ColMeeple | undefined {
    let ndx = (meep.card == this) ? meep.cellNdx :
      (cellNdx !== undefined && !this.meepAtNdx[cellNdx]) ? cellNdx : this.openCells[0];
    // if maxCells are occupied, add 2 more cells, and reposition all the existing meeps:
    if (ndx == undefined || ndx > this.maxCells - 1) {
      ndx = ndx ?? (this.maxCells + 1); // if ndx > maxCells, then ndx !== 0;
      const len = Math.max(this.maxCells, ndx + 1);
      this.maxCells = len + (len % 2);  // space for meep and one more, keeping 2 rows
      this.meepsOnCard.forEach(m => super.addMeep(m, m.cellNdx))
    }
    return super.addMeep(meep, ndx, xy)
  }
}

export class BlackNull extends BlackCard {

  constructor(aname = 'Null:0', col?: number, fs?: number) {
    super(aname, col, fs, 0); // with zero length factions.
    const colNum = col ?? Number.parseInt(aname.split(':')[1] ?? '0');
    const colId = ColSelButton.colNames[colNum]; // this._colId = undefined
    this.setLabel(colId, fs); // is Black...
    this.paint(C.BLACK); // no factions, no color: paint it here.
  }

  override nextCard(dir: BumpDir): ColCard | undefined {
    return undefined;  // no escape...
  }
}

/** dead card where Col-C is not playable && rank > 0 */
export class SpecialDead extends ColCard {
  static countClaz(n = 0, rad = 525): CountClaz[] {
    return arrayN(n).map(colNum => [1, PrintSpecial, 'Special', rad])
  }

  /** single cell with faction=5 */
  constructor(aname: string) {
    super(aname, 5)
    const facShape = new FacShape(), rad = this.radius * .5
    facShape.facRect(1, rad, -rad / 2);
    this.addChildAt(facShape, 1)
    this.paint(C.grey128)
  }
  override get bleedColor(): string {
    return C.black;
  }
}

export class PrintCol extends ColCard {
  static seqN = 0;
  /** how many of which Claz to construct & print: for TileExporter */
  static countClaz(n = 1): CountClaz[] {
    return [[n, PrintCol]]
  }

  constructor(allCards = GameSetup.gameSetup.gamePlay.allCols) {
    ColCard.nextRadius = 525
    if (PrintCol.seqN  >= allCards.length) PrintCol.seqN = 0
    const n = PrintCol.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, ...factions);
    ;(this.baseShape as PaintableShape).colorn = C.BLACK; // set for bleed.color
    return;
  }
}
export class PrintDual extends DualCard {
  static seqN = 0;
  static countClaz(n = 20): CountClaz[] {
    return [[n, PrintDual]];
  }
  constructor(allCards = GameSetup.gameSetup.gamePlay.allDuals) {
    ColCard.nextRadius = 525
    if (PrintDual.seqN >= allCards.length) PrintDual.seqN = 0
    const n = PrintDual.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, factions[0], factions[1]);
  }
}

export class PrintBlack extends BlackCard {
  constructor(Aname: string, seqLim = 0, fs?: number) {
    ColCard.nextRadius = 525
    super(Aname, seqLim, fs)
  }
}

export class PrintSpecial extends SpecialDead {
  constructor(Aname: string, radius = 525) {
    ColCard.nextRadius = radius;
    super(Aname)
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

