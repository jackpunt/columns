import { arrayN, C, F, type XY } from "@thegraid/common-lib";
import { AliasLoader, CenterText, CircleShape, NamedContainer, type Claz, type CountClaz, type GridSpec, type Paintable } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { Graphics, Shape, Text } from "@thegraid/easeljs-module";
import { Tile, TileSource, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColMeeple } from "./col-meeple";
import { FacShape } from "./fac-shape";
import { type BumpDir, type BumpDir2, type GamePlay } from "./game-play";
import { ColHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { type Player } from "./player";
import { nFacs, Statics, type ColId, type Faction } from "./statics";
import { TP } from "./table-params";


class ClazCounter {
  seqLim = 1;
  seqN = 1;

  constructor(public claz: Claz, public seq0 = 1) {
  }

  nextSeqN(seqLim = this.seqLim) {
    if (this.seqLim > seqLim) this.seqN = 0;
    return this.seqN++
  }
  countClaz(n: number, ...args: any[]): CountClaz[] {
    this.seqLim = n;
    this.seqN = this.seq0;
    return [[n, this.claz, ...args]]
  }
}

export class ColCard extends Tile {
  static decorator?: Decorator;

  static gridSpec: GridSpec = Statics.cardSingle_1_75_in;  // to be set by TileExporter
  static getWH(rad: number, vert = false) {
    return CardShape.getWH(rad, this.gridSpec, vert)
  }

  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = CardShape.onScreenRadius; // when super() -> this.makeShape()
  _radius = ColCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius ?? ColCard.nextRadius )}
  override get isMeep() { return false; }
  declare gamePlay: GamePlay;
  override get hex(): Hex2 { return super.hex as Hex2 }
  override set hex(hex: Hex1 | undefined) { super.hex = hex }
  declare baseShape: CardShape;

  factions: Faction[] = [0];
  maxCells: number;
  hasNext = true;  // indicates Card supplies nextCard() vs BlackCard which does not

  constructor(aname: string, ...factions: Faction[]) {
    super(aname);
    this.factions = factions;
    this.maxCells = factions.length;
    // this.addChild(this.meepCont);
    const color = Statics.factionColors[factions[0]], tColor = C.pickTextColor(color);
    this.nameText.color = tColor;
    this.setNameText(aname, this.radius * .35);
    this.paint(color)
    ColCard.nextRadius = CardShape.onScreenRadius;  // reset in case printing set alternate radius
  }

  meepCont = new NamedContainer(`meepCont-${this.Aname}`)

  setMeepCont() {
    // this.hex not set when constructor(); do it now
    // when this.hex is first set, then put meepCont on tileCont:
    const tileCont = this.hex.map.mapCont.tileCont;
    this.parent.localToLocal(this.x, this.y, tileCont, this.meepCont);
    tileCont.addChild(this.meepCont); // so meeples@bumpLoc are above/after other cards on tileCont.
    // vs original: constructor() { ... this.addChild(this.meepCont) ... }
  }

  addIcons() {
    if (!TP.factionIcons) return;
    const w = this.getBounds().width;
    const deco = ColCard.decorator ?? (ColCard.decorator = new Decorator(w));
    deco.addCardIcons(this);
  }

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
  }
  // XY locs for meeples on this card. maxMeeps = meepleLocs.length
  // basic have 1 in center; DualCards have two offset; BlackCards have ~20
  meepleLoc(ndx = this.openCells[0]): XY {
    return { x: 0, y: 0 }
  }
  /** when openCells[0] is undefined: */ // TODO: fix for DualCard in diagonal mode; also atBumpLoc/isBumpLoc
  bumpLoc(ndx = 0) { return { x: -this.radius / 2, y: -this.radius / 3 } }

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
      : this.isBumpLoc(toBump) ? this.meepleLoc(cellNdx) : this.bumpLoc(cellNdx);
    this.meepCont.addChild(meep);
    if (!this.hex) debugger; // this Card must be on a hex!
    meep.x = locXY.x; meep.y = locXY.y; meep._hex = this.hex; // no collisions, but fromHex
    meep.card = this;
    meep.cellNdx = cellNdx; // undefined if no openCell
    meep.fromHex = this.hex;   // for later use as fromHex?
    meep.faction = (cellNdx == undefined) ? undefined : this.factions[cellNdx];
    return toBump;
  }

  cellNdxOfXY(xy: XY) {
    return 0;
  }
  cellNdxOfGlobalXY(gxy: XY) {
    const xy = this.baseShape.parent.globalToLocal(gxy.x, gxy.y);
    return this.cellNdxOfXY(xy);
  }
  get marks(): DisplayObject[] | undefined { return undefined; }

  atBumpLoc() {
    const meeps = this.meepsOnCard.filter(meep => this.isBumpLoc(meep));
    if (meeps.length > 1) debugger;
    return meeps[0] as ColMeeple | undefined;
  }

  /**
   *
   * @returns true if meep is in (any) bumpLoc; false if in meepleLoc
   */
  isBumpLoc(meep: ColMeeple) {
    return (meep.y == this.bumpLoc(meep.cellNdx).y); // checking .x would be redundant
  }
  // not used? just move to another Card...
  rmMeep(meep: ColMeeple) {
    this.meepCont.removeChild(meep)
    meep.set({ x: 0, y: 0, card: undefined, cellNdx: undefined })
  }

  // invoked by constructor.super()
  override makeShape(): Paintable {
    const wh = ColCard.getWH(this.radius, false);
    // ss fills the outer edge of card with 'safe'; undefined=.069 --> 36px;  .05--> 26px
    return new CardShape('lavender', C.black, wh, false, wh.h * .05); // 'bleed' ()
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

  /**
   * Create nCards in Faction order. 'C' cards
   * @param nCards number to create (60)
   * @returns
   */
  static makeColCards(nCards = 60) {
    return arrayN(nCards).map(n => {
      const fact = 1 + (n % nFacs) as Faction, aname = `${String(n).padStart(2, '0')}_${fact}`;
      const card = new ColCard(aname, fact);
      card.addIcons();
      return card;
    })
  }
  /**
   * Create 16 DualCards. 'D' cards
   * @param nCards start number in Aname (60)
   * @returns
   */
  static makeDualCards(nCards = 60) {
    return arrayN(nFacs * nFacs).map(n => {
      const n4 = Math.floor(n / nFacs)
      const f1 = 1 + (n % nFacs) as Faction, f2 = 1 + (n4 % nFacs) as Faction;
      const card = new DualCard(`${n + nCards}_${f1}&${f2}`, f1, f2);
      card.addIcons();
      return card;
    })
  }
  /**
   * Make enough cards to populate the HexMap.
   *
   * nCards = TP.cardsInPlay = hexMap.hexesInPlay
   *
   * @param nr number of Rows (for straight column layout?)
   * @param nc number of Columns to build (white cards)
   * @param nCards number of hexes with cards (C, D, X, B, W?) not on row0 or rank0
   * @returns black0, whiteN, allCols, allDuals
   */
  static makeAllCards(nr = TP.nHexes, nc = TP.mHexes, nCards = TP.cardsInPlay) {
    ColCard.decorator = undefined;  // reset in case printer set alternate decorator

    let nb = 0, nw = 0;
    const ncb = TP.usePyrTopo && !TP.fourBase ? Math.max(nc, 5) : nc; // maybe extra col in bottom row
    const black0 = arrayN(ncb, 1).map(i => new BlackCard(`0_${nb++}`, 0)); // row 0 (top)
    const whiteN = arrayN(ncb, 1).map(i => new WhiteCard(`N_${nw++}`, i)); // row N (bottom: rank-0)
    whiteN.forEach(card => card.paint(C.grey224));   // shade for visible highlights

    const allCols = ColCard.makeColCards(nCards);
    const allDuals = ColCard.makeDualCards(nCards);
    return { black0, whiteN, allCols, allDuals }
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
    this.baseShape.dualCgf('d', ...[faction0, faction1].map(f => Statics.factionColors[f]));
    this.paint('ignored')
    this.setMarks();
  }

  static cardMarks: DisplayObject[] = [];

  /** special LegalMarks for DualCard */
  setMarks() {
    const c0 = `rgba(180, 180, 180, .7)`;
    if (!DualCard.cardMarks[1]) {
      ([0,1] as (0|1)[]).forEach(ndx => {
        const mark = new Shape(this.baseShape.triangle(ndx, c0, 1));
        mark.mouseEnabled = false; // prevent objectUnderPoint!
        DualCard.cardMarks[ndx] = mark;
      })
    }
  }

  /** returns 1 if target is above line of {-cx, -cy } -- { cx, cy }; or -1 if below, 0 if on the line. */
  targetToLine(cx: number, cy: number, target: XY): number {
    // Evaluates cross-multiplied vectors and strictly returns 1 (above), -1 (below), or 0 (on the line)
    return Math.sign((target.y * cx) - (cy * target.x));
  }

  override cellNdxOfXY(xy: XY) {
    const { x, y } = this.getBounds();
    const det = this.targetToLine(x, y, xy);
    const ndx = [0, 0, 1][det + 1];
    return ndx;
  }
  override get marks() { return DualCard.cardMarks; }

  // makeMeeple: always an openCell; cellNdx: number
  // dropFunc: addMeep(meep, undefined, xy); cellNdx: undefined -> openCell[0]
  // meeplesToCell: meep.cellNdx:? number (meep.faction !== 0; could be undefined!)
  // player.bumpMeeple: player has chosen a cellNdx

  // determine if meep was dropped on left or right cell
  override addMeep(meep: ColMeeple, cellNdx?: number, xy?: XY) {
    // meep on map.tileCont@(mx,my)
    // this on map.tileCont@(tx,ty); meepCont on this@(0,0)
    const pt = xy ?? meep.parent?.localToLocal(meep.x, meep.y, this.meepCont);
    if (cellNdx === undefined && pt !== undefined) cellNdx = this.cellNdxOfXY(pt);
    if (cellNdx === undefined) cellNdx = this.openCells[0]// as number | undefined;
    // when meeplesToCell is invoked, should be an open cell, b/c bumpee was moved.
    const rv = super.addMeep(meep, cellNdx)
    return rv
  }
  get cellWidth() { return this.getBounds().width }
  override meepleLoc(ndx = this.openCells[0]): XY {
    const offs = this.baseShape.form == 'd' ? .1 : 0;
    const x = [-.18, .25][ndx] * this.cellWidth;
    const y = [offs, -offs][ndx] * this.cellWidth;
    return { x, y }
  }
  override bumpLoc(ndx = 0) {
    const meepXY = this.meepleLoc(ndx);
    return { x: meepXY.x - [.17, .22][ndx] * this.cellWidth, y: meepXY.y - [.33, .17][ndx] * this.radius }
  }
}

// Black & White extend from XtensaCard: hold any number of meeples (nCells)
// factions = [0], single Black faction (although White paints C.WHITE, no strokec)
// White shows its colId: ['', A...H], Black shows ''.

  /**
   *
   * @param Aname
   * @param colNum [0] (black) or 1..n (white)
   * @param fs [undefined -> .5 in setLabel]
   */
class XtensaCard extends ColCard {
  /**
   *
   * @param Aname
   * @param colNum (0) -> fac=0 -> bgColor=black; 1-n -> fac=5 -> bgColor=white
   * @param fs
   */
  constructor(Aname: string, colNum = 0, fs?: number) {
    // initial maxCells & factions.length (even number! > 2)
    const nCells = Math.max(4, Math.ceil(TP.numPlayers/2) * 2); // must be > 2, to distinguish from DualCard
    const fac = (colNum > 0) ? 5 : 0;                       // fac = 5 (usually SpecialDead) paints as 'white'
    const factions = arrayN(nCells, i => fac) as Faction[]; // 0: black, 5: white
    super(Aname, ...factions);
    this.addChild(this.meepCont);
    this._colId = Statics.colNames[colNum];
    this.setLabel(this.colId, fs)
  }
  _colId: ColId;
  get colId() { return this._colId; }

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

  override bumpLoc(ndx = 0) { return { x: 0, y: 0 } } // should not happen...

  override otherMeepInCell(meep: ColMeeple, cellNdx?: number | undefined): ColMeeple | undefined {
    return undefined; // never a collision, ExtensaCard will make a new cellNdx as needed.
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
    return super.addMeep(meep, ndx, xy); // for screen-grab: ndx == 4 ? 5: ndx
  }
}

export class BlackCard extends XtensaCard {
  // super(Aname, col = 0, fac = 0, fs)
  static countClaz(n = 0, size = 525, aname='Black'): CountClaz[] {   //             name, size, colNum, fs
    return arrayN(n, i => i+1).map(colNum => [1, PrintWhite, `${aname}_${colNum}`, size, 0, .5])
  }
  // signal to meepsInCol
  override hasNext = false;

  /** indicates a BlackCard with not chance to Advance (or be bumped) */
  override nextCard(dir: BumpDir): ColCard | undefined {
    return undefined;  // no escape...
  }}

export class WhiteCard extends XtensaCard {
  static countClaz(n = 0, size = 525, rot = 0): CountClaz[] {
    return arrayN(n, i => i+1).map(colNum => [1, PrintWhite, `Col0N_${colNum}`, size, colNum, .5, rot]); // row: N
  }

  constructor(aname = 'White?', col?: number, fs?: number) {
    super(aname, col, fs);
    this.factions = [];     // with zero length factions.
  }

  override makeShape(): Paintable {
    const wh = ColCard.getWH(this.radius, false);
    return new CardShape(C.grey92, '', wh, false, 0); // grey on screen; no border stroke when printing
  }
}

// Null card: paint WHITE (as if row:N, but do not display colId)
export class WhiteNull extends WhiteCard {
  constructor(aname = 'Null_0', col?: number, fs?: number) {
    super(aname, 0, fs); // with zero length factions.
    this.factions = [];
    this.maxCells = 0;
    this.paint(C.WHITE);
  }

  override nextCard(dir: BumpDir): ColCard | undefined {
    return undefined;  // no escape... but nobody ever comes here
  }
}

export class BlackNull extends BlackCard {

  constructor(aname = 'Null_0', col?: number, fs?: number) {
    super(aname, 0, fs); // with zero length factions.
    this.factions = [];
    this.maxCells = 0;
  }

  override nextCard(dir: BumpDir): ColCard | undefined {
    return undefined;  // no escape...
  }
}

/** dead card where Col-C is not playable && rank > 0 */
export class SpecialDead extends ColCard {
  static countClaz(n = 0, rad = 525): CountClaz[] {
    return arrayN(n).map(colNum => [1, PrintSpecial, `Dead_${colNum}`, rad])
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
  static countClaz(n = 1, size = 525): CountClaz[] {
    ColCard.decorator = undefined;
    const allColCards = ColCard.makeColCards(n);
    return [[n, PrintCol, size, allColCards]]
  }

  constructor(size = 525, allCards: ColCard[]) {
    ColCard.nextRadius = size;
    if (PrintCol.seqN  >= allCards.length) PrintCol.seqN = 0
    const n = PrintCol.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, ...factions);
    this.addIcons();
    this.baseShape.colorn = C.BLACK; // set for bleed.color
    return;
  }
}
export class PrintDual extends DualCard {
  static seqN = 0;
  static countClaz(n = 20, size = 525): CountClaz[] {
    ColCard.decorator = undefined;
    const allDualCards = ColCard.makeDualCards(60);
    return [[n, PrintDual, size, allDualCards]];
  }
  constructor(size = 525, allCards: ColCard[]) {
    ColCard.nextRadius = size;
    if (PrintDual.seqN >= allCards.length) PrintDual.seqN = 0
    const n = PrintDual.seqN++;
    const card = allCards[n], { Aname, factions } = card;
    super(Aname, factions[0], factions[1]);
    this.addIcons();
  }
}

export class PrintWhite extends XtensaCard {
  /**
   * Print White with colId, unless colNum == 0: print black w/no colId.
   * @param Aname
   * @param size
   * @param colNum 1..n => colId on White; 0 solid black
   * @param fs [.5] multiply by this.radius (size)
   * @rot [0] 180 to rotate back cards
   */
  constructor(Aname: string, size = 525, colNum = 0, fs?: number, rot = 0) {
    ColCard.nextRadius = size;
    super(Aname, colNum, fs)
    this.rotation = rot; // PrintWhite
  }

  override makeShape(): Paintable {
    const wh = ColCard.getWH(this.radius, false);
    return new CardShape(C.WHITE, '', wh, false, 0); // no border stroke when printing
  }
}

export class PrintSpecial extends SpecialDead {
  constructor(Aname: string, size = 525) {
    ColCard.nextRadius = size;
    super(Aname)
  }
}

export class TextCard extends ColCard {

  /** color for TextCard */
  get color() { return C.WHITE }

  constructor(Aname = 'Text', size = 525, titleText?: string) {
    ColCard.nextRadius = size;
    super(Aname, 5);
    if (titleText !== undefined) {
      this.placeTitle(titleText);
    }
    this.paint(this.color);
  }

  override makeShape(): Paintable {
    const wh = ColCard.getWH(this.radius, false);
    return new CardShape(C.WHITE, C.WHITE, wh, false, 0);
  }
  title?: Text;
  placeTitle(text: string, fs = this.radius * .08, y0 = .8 * fs - this.radius/2) {
    const title = this.title = new CenterText(text, fs)
    title.textBaseline = 'top';
    title.y = y0;
    this.addChild(title)
  }

  /** add left-aligned dObj to card at (x0, y0) */
  addToCenter(dObj: DisplayObject, x0 = 0, y0 = 0) {
    this.addChild(dObj);
    const { x, y, width, height } = dObj.getBounds()
    dObj.x = x0 + (0  -  width * dObj.scaleX) / 2;
    dObj.y = y0 + (0 - height * dObj.scaleY) / 2;
  }
}

export class CursusBack extends TextCard {
  static seqN = 1;
  static countClaz(n = 20, name = 'Back', ...args: any[]): CountClaz[] {
    ColCard.decorator = undefined;
    // CursusBack.seqN = n; // <== do not reset!
    return [[n, CursusBack, name, n, ...args]];
  }

  static nextSeqN(seqLim: number) {
    if (CursusBack.seqN > seqLim) CursusBack.seqN = 1;
    return CursusBack.seqN++
  }

  static family = "Baskerville";
  // static family3 = "Papyrus";
  // static family2 = "SignPainter";
  // static family1 = "Savoye LET";

  static rankSize = 170;
  static backFont = F.fontSpec(CursusBack.rankSize, `${CursusBack.family}`, undefined, 'italic');

  constructor(Aname = 'Back', seqLim: number, size = 525, text = '') {
    const n = CursusBack.nextSeqN(seqLim);
    const aname = `${Aname}_${String(n).padStart(2, '0')}`;

    ColCard.nextRadius = size;

    super(aname, size)

    const font = CursusBack.backFont;
    const ctext = new CenterText(text, font)
    ctext.y -= 75;
    this.addChild(ctext)
  }
  override makeShape(): Paintable {
    const wh = ColCard.getWH(this.radius, false);
    return new CardShape(C.WHITE, '', wh, false, 0)
  }
  override get bleedColor(): string { return C.WHITE }
}

export class SummaryCard extends TextCard {
  static clazCounter = new ClazCounter(SummaryCard, 1);

  static countClaz(n: number, ...args: any[]): CountClaz[] {
    return SummaryCard.clazCounter.countClaz(n, ...args);
  }

  static summaryText = `Round = 3 x Turns:
  → Select Column & Bid
  ➢ Resolve & Advance
  ➢ Bump & Cascade
  ➢ Score for Color
End of Round:
  → Score for Rank`;

  elt!: Text;
  // Note: this could fit on a mini-card (size = 525)
  /**
   *
   * @param Aname
   * @param size short dim?
   * @param text
   * @param fs
   */
  constructor(Aname = 'Summary', size = 750, text = SummaryCard.summaryText, fs = size / 9, titleText?: Text) {
    ColCard.nextRadius = size;
    const n = SummaryCard.clazCounter.nextSeqN();
    const aname = !!Aname.match(/_[0-9]+$/) ? Aname : `${Aname}_${n}`
    super(aname, size);

    const { x: x0, y: y0, width: w, height: h } = this.getBounds();
    const top = y0 + 64;
    const title = titleText ?? this.makeTitle(fs, top);
    this.addChild(title);

    const elt = this.elt = new Text(text, F.fontSpec(fs * .9));
    elt.textAlign = 'left';
    this.addChild(elt);
    const { x, y, width, height } = elt.getBounds()
    elt.x = 0 + (0  -  width) / 2;
    elt.y = top + (h - height) / 2;
    this.rotation = 0;   // SummaryCard
    this.paint(C.WHITE, true)
  }

  makeTitle(fs: number, top: number, text = 'Cursus Honorum') {
    const title = new CenterText(text, fs + 1);
    title.y = top + fs/2;
    return title;
  }
}
export class EoGCard extends SummaryCard {
  static override clazCounter = new ClazCounter(EoGCard, 1);
  static override countClaz(n: number, ...args: any[]): CountClaz[] {
    return EoGCard.clazCounter.countClaz(n, ...args);
  }

  static endGameText = `Any of:

➤ Both markers at end of score track
➤ Each Black card occupied
➤ One Black occupied by each player

Highest total score wins
`;

  constructor(Aname = 'EoG', size = 750, text = EoGCard.endGameText, fs = size / 11, titleText?: Text) {
    const n = EoGCard.clazCounter.nextSeqN()
    super(`${Aname}_${n}`, size, text, fs, titleText)
    this.rotation = 180;  // EoG
  }
  override makeTitle(fs: number, top: number, text?: string): CenterText {
    return super.makeTitle(fs, top, 'End of Game:');
  }
}

export class RulesCard extends TextCard {
  static clazCounter = new ClazCounter(RulesCard, 1);
  static countClaz(n: number, ...args: any[]): CountClaz[] {
    return RulesCard.clazCounter.countClaz(n, ...args);
  }

static text = `
Resolve bids: equal bids are canceled.
Advance: meeple in column moves up 1 rank.
  If empty office on card: take it, no Bump.
Bump:
  If Advance to friend, all bumps are UP by 1.
  If Advance to opponent, all bumps are DOWN.
  Bump DOWN is by 1 or 2; use either side of Dual.
Cascade: arriving meeple chooses meeple to bump.
Score for color: If meeple lands on color of bid,
  Score 1 for your Influence in that color.
  Influence: bids plus offices & score cells w/meeple.
Score for rank: Each player Scores twice,
  by rank of 2 meeples; top to bottom; A, B, ...`;

constructor(Aname: string, size: 737, n0?: number, rot = 0) {
    const n = (n0 !== undefined) ? n0 : RulesCard.clazCounter.nextSeqN();
    super(`${Aname}_${n}`, size, 'Rules Details')
    const fs = size/16, elt = new CenterText(RulesCard.text, fs)
    elt.textAlign = 'left';
    this.addToCenter(elt, 0, .63 * fs);
    this.rotation = rot;   // RulesCard
    const {x, y, w, h} = this.baseShape._rect, b = 36;
    this.baseShape.setRectRad({x: x+b, y: y+b, w: w-b-b, h: h-b-b, s: b})
    // this.paint(C.grey, true)
  }
  override placeTitle(text: string, fs = this.radius * .08, y0 = .58 * fs - this.radius/2) {
    super.placeTitle(text, fs, y0)
    this.title!.x -= fs;
  }
}

export class CoverCard extends SummaryCard {
  static override clazCounter = new ClazCounter(CoverCard, 1)
  static override countClaz(n: number, ...args: any[]): CountClaz[] {
    return CoverCard.clazCounter.countClaz(n, ...args);
  }

  //➤ Balance self-promotion vs opponent interference
  static coverText = `➤ No random effects
➤ No table order effects
➤ Simultaneous analysis
➤ Scales to any number (2 – 7+)
➤ Adjustable game length
➤ Light → Studious
➤ Infinitely variable map
➤ Simple mechanics:
      Analyze – Plan – Bid
      Advance (& Cascade) – Score`;
  /**
   *
   * @param Aname
   * @param size short dimension!
   * @param text
   * @param fs
   */
  constructor(Aname = 'Cover', size = 750, text = CoverCard.coverText, fs = size/14) {
    const n = CoverCard.clazCounter.nextSeqN()
    super(`${Aname}_${n}`, size, text, fs);
    this.elt.lineHeight = this.elt.getMeasuredLineHeight() + 5;
    this.elt.y -= fs * .5;
    this.rotation = 0;      // override SummaryCard constructor!
    this.paint(C.WHITE, true)
  }

  override makeTitle(fs: number, top: number) {
    return super.makeTitle(fs + 7, top, 'Cursus Honorum (Path to Glory)')
  }
}

export class DetailCard extends TextCard {
  static clazCounter = new ClazCounter(DetailCard, 1)
  static countClaz(n: number, ...args: any[]): CountClaz[] {
    return DetailCard.clazCounter.countClaz(n, ...args);
  }

  static text = `1. → Analyze & Plan
    → Select Cards (Column & Bid)
    → Commit & Reveal
2. Resolve each Column: A, B, …
    ➢ Highest unique Bid (1..4) wins
    ➢ Advance: winner’s meeple
    ➢ Bump & Cascade: UP or DOWN
    ➢ Score = Influence with Faction
    ➢ Invest on Score Track
3. After 3 turns:
   → Score for Rank (2 per player)
4. Repeat until end of game`

  constructor(Aname = 'Detail', size = 750, text = DetailCard.text, fs = size/14, num0?: number) {
    const n = DetailCard.clazCounter.nextSeqN();
    super(`${Aname}_${n}`, size);
    const id = num0 == undefined ? '' : `                         ${n - num0}`;
    const elt = new Text(text+id, F.fontSpec(fs));
    elt.textAlign = 'left';
    // elt.lineHeight = elt.getMeasuredLineHeight() *1.1; // extra leading
    this.addToCenter(elt);
    this.rotation = 180;  // Detail
    this.paint(C.WHITE, true);
  }
}


export class LayoutCard extends TextCard {
  static clazCounter = new ClazCounter(LayoutCard, 0);
  static countClaz(n: number, ...args: any[]): CountClaz[] {
    return LayoutCard.clazCounter.countClaz(n, ...args);
  }
  /** align & scale images to height of previous image(s) */
  static maxh = 0;

  static text = `layout`;
  //                 0      1       2      3       4      5       6      7
  static fnames = ['NP2', 'NP5', 'NP2a', 'NP4a'];
  //               2-3-4   std   2-small  3-4
  static pix =    [[0,  1], [ 2,  3]];
  static flabel = [['2, 3, 4\nplayers', '5 or more:\ncolumn per player'], ['2 players\n(small)', '3 or 4 players\n(alternative)'],];
  static titles = ['Standard Layout', 'Alterative Layouts\n(or make your own!)']

  /**
   *
   * @param Aname
   * @param n the card number; a pair of images with text
   * @param size
   * @param text
   * @param fs
   */
  constructor(Aname = 'Layout', size = 750, n0 = 0, rot = 0, fs = size/14) {
    const n = (n0 != undefined) ? n0 : LayoutCard.clazCounter.nextSeqN();
    LayoutCard.maxh = 0;  // reset for each card. (maybe not needed, NP2a is full height)
    const loader = AliasLoader.loader;
    const fnames = LayoutCard.fnames, pix = LayoutCard.pix;
    const flabel = LayoutCard.flabel;
    const anames = pix[n].map(ndx => fnames[ndx]);
    const title = LayoutCard.titles[n];
    // const aname0 = fnames[pix[n][0]]; //
    // const aname1 = fnames[pix[n][1]]; //
    super(`${Aname}_${n}`, size, title);
    const dx = size*.34, dy = -.01 * size;

    const txt = flabel[n]
    txt.forEach((txt, i)=> {
      const bmi = loader.getBitmap(anames[i], size * .6)
      if (!bmi.image) return;  // standalone does not include the LayoutCard images
      this.addImage(bmi, dx*[-1, 1][i], dy);
      const elt = new CenterText(txt, F.fontSpec(fs)); elt.textBaseline = 'top';
      const ty = bmi.y + LayoutCard.maxh/2 + .3 * fs; elt.lineHeight;
      this.addImage(elt, dx*[-1, 1][i], ty, false); // dy from maxh?
    })
    this.rotation = rot; // Layout
    this.paint(C.WHITE, true);
  }

  makeTitle(fs: number, top: number, text = 'Cursus Honorum') {
    const title = new CenterText(text, fs + 1);
    title.y = top + fs/2;
    return title;
  }

  addImage(dObj: DisplayObject, x0 = 0, y0 = 0, asImage = true) {
    this.addChild(dObj);
    const scale = dObj.scaleX;
    const { x, y, width, height } = dObj.getBounds()
    const widths = width * scale;
    const heights = height * scale;
    let heightm = heights;
    if (asImage) {
      heightm = Math.max(LayoutCard.maxh, heightm);
      LayoutCard.maxh = heightm;
      dObj.scaleX = dObj.scaleY *= heightm/heights;
    }
    // move [center?] to x0, y0
    dObj.x = x0;
    dObj.y = y0;
  }
}

export class Decorator {
  /**
   *
   * @param w total width of card
   * @param f nominal icon width as fraction of total width
   * @param thick stroke size ()
   */
  constructor(w = 36, f = .08) {
    this.wd = w * f;
    this.thick = this.wd * 4/36;
  }

  c0 = C.BLACK;
  c1 = C.grey224;
  thick = 3;
  wd = 10;

  redIcon(c = this.c1, t = this.thick, wd = this.wd*.8, g = new Graphics()) {
    g.f(c).ss(t*1.8).s(c).mt(0, -wd).lt(0, wd).mt(-wd, 0).lt(wd, 0);  // sword-like
    return new Shape(g) as DisplayObject;
  }
  blueIcon(c = this.c1, t = this.thick*1.5, wd = this.wd, g = new Graphics()) {
    g.ss(t).s(c).mt(-wd/2, wd/2).lt(0, -wd/2).lt(wd/2, wd/2).cp();  // triangle sails
    return new Shape(g) as DisplayObject;
  }
  goldIcon(c = this.c0, t = this.thick, wd = this.wd, g = new Graphics()) {
    return new CenterText('$', wd*1.7, c) as DisplayObject;  // $
  }
  violetIcon(c = this.c0, t = this.thick, wd = this.wd*.6, g = new Graphics()) {
    return new CircleShape(C.transparent, wd, c, new Graphics().ss(t * 1.5)) as DisplayObject;
  }
  icon(facId: Faction) {
    return ([this.redIcon, this.redIcon, this.goldIcon, this.blueIcon, this.violetIcon][facId]).call(this);
  }
  /** add 2 children: icons for each faction color */
  addCardIcons(card: ColCard) {
    const { x, y, width, height } = card.getBounds();
    const dw = .13 * width;  // <-- offset from corners
    const facs = [0, 1].map(fac => card.factions[fac] ?? card.factions[0]);
    const locs = [{ x: x + dw, y: y + height - dw }, { x: x + width - dw, y: y + dw }, ];
    facs.forEach((fac, ndx) => {
      if (fac > 4) return;
      const icon = this.icon(fac);
      icon.rotation = [0, 180][ndx];  // Decorator
      const loc = locs[ndx];
      icon.x = loc.x; icon.y = loc.y;
      card.addChild(icon);
    })
  }
}
