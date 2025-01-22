import { C, type XY } from "@thegraid/common-lib";
import { NamedContainer, RectShape, type CenterText, type DragInfo, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics } from "@thegraid/easeljs-module";
import { H, Tile, TileSource, type DragContext, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type ColTable as Table } from "./col-table";
import { type GamePlay } from "./game-play";
import { OrthoHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import { ColMeeple, Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";

export class ColCard extends Tile {
  static get allCards() { return Array.from(this.cardByName.values()) }
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = ColCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = ColCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : ColCard.nextRadius }
  override get isMeep() { return false; }
  declare gamePlay: GamePlay;

  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE];

  constructor(Aname: string, readonly faction = 0) {
    const color = ColCard.factionColors[faction], tColor = C.pickTextColor(color);
    super(Aname);
    this.addChild(this.meepCont);
    this.nameText.color = tColor;
    this.setNameText(Aname, this.radius * .35);
    this.cardId = this.addTextChild(0, `${faction}`, undefined, false, tColor); // a Text for BlackCards
    this.paint(color)
    ColCard.cardByName.set(Aname, this);
  }
  cardId!: CenterText;
  meepCont = new NamedContainer('meepCont')

  // XY locs for meeples on this card. maxMeeps = meepleLocs.length
  // basic have 1 in center; DualCards have two offset; BlackCards have ~20
  get meepsOnCard() { return this.meepCont.children.filter(c => (c instanceof ColMeeple))}
  meepleLoc(ndx = 0): XY {
    return { x: 0, y: 0 }
  }
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
  addMeep(meep: ColMeeple, cellNdx = this.openCells[0]) {
    if (cellNdx === undefined) debugger;
    const locXY = this.meepleLoc(cellNdx)
    this.meepCont.addChild(meep);
    meep.set({...locXY, card: this, cellNdx}); // YIKES! no type checking.
  }
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
    return 'Cards are not moveable';
  }

  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.isLegal = false; }, ctx?: DragContext): void {
    // table.gamePlay.curPlayer.cardRack.forEach(setLegal)
  }

  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    return true;
  }

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    super.showTargetMark(hex, ctx)
  }

  /** how many of which Claz to construct & print: for TileExporter */
  static countClaz(n = 2) {
    return [].map(x => [n, ColCard, 750]) as CountClaz
  }

  static cardByName: Map<string,ColCard> = new Map();
  static uniqueId(cardid: string) {
    let id = cardid, n = 1;
    while (ColCard.cardByName.has(id)) { id = `${cardid}#${++n}` }
    return id;
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
    ColCard.cardByName.clear(); // not needed?
    // narrative: military, bankers, merchant, aristocrat
    const nCards = nc * nr, nDual = Math.round(nCards * .25), nFacs = 4;
    const colTextSize = ColCard.onScreenRadius / 3;
    for (let n = 0, row = 0; row < nr; row++) {
      for (let col = 0; col < nc; col++, n++) {
        const faction = (row == 0 || (row == nr - 1)) ? 0 : 1 + (n % nFacs);
        const aname = `${n}:${faction}`;
        const card = (faction == 0) ? new BlackCard(aname) : new ColCard(aname, faction);
        if (faction > 0) {
          const df1 = faction, df2 = 1 + (Math.floor(n / nFacs) % nFacs );
          const dual = new DualCard(`${n}:${df1}&${df2}`, df1, df2);
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
  // 4 states: avail, clicked, commited, used.
  /** dim card when clicked */
  dim(dim = true) {
    // this.dText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }
}
class DualCard extends ColCard {
 override get maxCells() { return 2 }

  constructor(Aname: string, faction: number, public readonly faction2: number) {
    super(Aname, faction)
    this.dualColor();
  }

  override meepleLoc(ndx = this.openCells[0]): XY {
      return { x: this.radius * (ndx - .5), y: 0 }
  }

  /** modify baseShape.cgf to paint 2 cells */
  dualColor(): Paintable {
    // retool a RectShape with 2 X drawRect(); sadly only the last one renders!
    const rv = this.baseShape as RectShape; // CardShape
    const f1 = this.faction, f2 = this.faction2;
    const c1 = ColCard.factionColors[f1];
    const c2 = ColCard.factionColors[f2];
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


/** auxiliary Panel to position a cardRack on the Table (or PlayerPanel). */
export class CardPanel extends NamedContainer {
  /**
   *
   * @param table
   * @param high rows high
   * @param wide columns wide
   * @param row place panel at [row, col]
   * @param col
   */
  constructor(public table: Table, public high: number, public wide: number, row = 0, col = 0) {
    super(`CardPanel`)
    const { dxdc, dydr } = table.hexMap.xywh()
    const w = dxdc * wide, h = dydr * high;
    const disp = this.disp = new RectShape({ w, h }, C.grey224, '');
    this.addChild(disp)
    table.hexMap.mapCont.hexCont.addChild(this);
    this.table.setToRowCol(this, row, col);
  }

  disp!: RectShape;

  paint(colorn: string, force?: boolean): Graphics {
    return this.disp.paint(colorn, force)
  }

  /** fill hexAry with row of CardHex above panel */
  fillAryWithCardHex(table: Table, panel: Container, hexAry: IHex2[], row = 0, ncols = 4) {
    const { w } = table.hexMap.xywh(); // hex WH
    const { width } = (new CardShape()).getBounds(); // PathCard.onScreenRadius
    const gap = .1 + (width / w) - 1;
    const hexes = table.hexesOnPanel(panel, row, ncols, CardHex, { gap });
    hexes.forEach((hex, n) => { hex.Aname = `C${n}`})
    hexAry.splice(0, hexAry.length, ...hexes);
  }

  isCardHex(hex: Hex2): hex is CardHex {
    return (hex instanceof CardHex)
  }

  readonly cardRack: CardHex[] = [];
  makeDragable(table: Table) {
    table.dragger.makeDragable(this, this, undefined, this.dropFunc);
  }
  /**
   * cardRack hexes are not children of this CardPanel.
   * Move them to realign when panel is dragged & dropped
   */
  dropFunc(dobj: DisplayObject, ctx?: DragInfo) {
    if (!ctx) return
    const orig = this.table.scaleCont.localToLocal(ctx.objx, ctx.objy, dobj.parent)
    const dx = dobj.x - orig.x, dy = dobj.y - orig.y;
    this.cardRack.forEach(hex => {
      hex.legalMark.x += dx;
      hex.legalMark.y += dy;
      hex.x += dx;
      hex.y += dy;
      if (hex.tile) { hex.tile.x += dx; hex.tile.y += dy }
      if (hex.meep) { hex.meep.x += dx; hex.meep.y += dy }
      hex.tile?.moveTo(hex); // trigger repaint/update?
    })
  }

  addCard(card?: ColCard) {
    const hex = this.cardRack.find(hex => !hex.tile)
    card?.placeTile(hex);
  }

}
