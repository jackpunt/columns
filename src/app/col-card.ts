import { C, permute, stime } from "@thegraid/common-lib";
import { NamedContainer, RectShape, type DragInfo, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics } from "@thegraid/easeljs-module";
import { H, Tile, TileSource, type DragContext, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type ColTable as Table } from "./col-table";
import { type GamePlay } from "./game-play";
import { OrthoHex2 as Hex2, type HexMap2 } from "./ortho-hex";
import type { Player } from "./player";
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
  override get isMeep() { return true; }
  declare gamePlay: GamePlay;
  static factionColors = [C.BLACK, C.RED, C.coinGold, C.BLUE, C.PURPLE];
  constructor(Aname: string, readonly faction = 0) {
    super(Aname);
    const color = ColCard.factionColors[faction]
    this.paint(color)
    ColCard.cardByName.set(Aname, this);
  }
  // invoked by constructor.super()
  override makeShape(): Paintable {
    return new CardShape('lavender', '', this.radius);
  }

  override reCache(scale?: number): void {
    super.reCache(0); // no cache?
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    return 'Cards are not moveable';
  }

  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.isLegal = false; }, ctx?: DragContext): void {
    table.gamePlay.curPlayer.cardRack.forEach(setLegal)
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
    for (let n = 0, row = 0; row < nr; row++) {
      for (let col = 0; col < nc; col++, n++) {
        const faction = (row == 0 || (row == nr - 1)) ? 0 : 1 + (n % nFacs);
        const card = new ColCard(`${n}-${faction}`, faction);
        const dual = true
        if (faction > 0 && dual) {
          const df1 = faction, df2 = 1 + (Math.floor(n / nFacs) % nFacs );
          const dual = new DualCard(`${n}:${df1}&${df2}`, df1, df2);
        }
      }
    }
    this.initialSort(ColCard.allCards, ColCard.source)
  }

  static initialSort(cards = ColCard.allCards, source = ColCard.source) {
    permute(cards)
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
  constructor(Aname: string, faction: number, public readonly faction2: number) {
    super(Aname, faction)
    this.removeChild(this.baseShape)
    this.baseShape = this.makeShape();
    // this.baseShape.mask = mask;
    this.addChildAt(this.baseShape, 0);
    this.reCache()
    // this.dualColor();
  }
  override makeShape(): Paintable {
    const f1 = this.faction, f2 = this.faction2;
    const c1 = ColCard.factionColors[f1];
    const c2 = ColCard.factionColors[f2];
    if (!!c1) {
      return new DualCardBase(c1, c2)
    } else {
      return new RectShape({x: 10, w: 10, h: 10 }, 'pink');
    }
  }
  dualColor(): Paintable {
    // retool a RectShape with 2 X drawRect(); sadly only the last one renders!
    const rv = this.baseShape as RectShape; // CardShape, with a mask
    rv.mask = rv;                           // prevent drawing outside of CardShape
    const { x, y, width, height } = rv.getBounds();
    const f1 = this.faction, f2 = this.faction2;
    const c1 = ColCard.factionColors[f1];
    const c2 = ColCard.factionColors[f2];
    rv._cgf = (color: string, g = rv.g0) => {
      const aname = this.Aname, ff1 = f1, ff2 = f2;
      g.s('black')         // for debug
      g.f(c1).dr(x            , y, width / 2, height); // mask will clip the round corners!
      g.f(c2).dr(x + width / 2, y, width / 2, height); // mask will clip the round corners!
      // g.s('black').ss(2).mt(0,0).lt(x,y)
      console.log(stime(this, `.cgf(${c1}, ${c2})`), g.instructions)
      return g
    }
    this.paint('lightblue'); // the given colorn is ignored by the cgf above
    return rv
  }
}
class DualCardBase extends CardShape {
  constructor(public c1: string, public c2: string, rad = ColCard.onScreenRadius) {
    super(c1, C.grey64, rad); // --> cgf=g0.rr(...); setBounds(null, 0, 0, 0)
    this._cgf = this.dccgf;    // setter invokes paint(this.colorn)
    this.paint('ignored');
  }

  dccgf(colorn: string, g = this.g0) {
    const { x, y, width, height } = this.getBounds(); // from RectShape
    const w2 = width / 2, rr = Math.max(width, height) * .05;
    g.s('black').ss(2)         // for debug
    g.f(this.c1).rc(x, y, w2, height, rr, 0,0, rr); // mask will clip the round corners!
    g.f(this.c2).rc(0, y, w2, height, 0, rr,rr, 0); // mask will clip the round corners!
    return g

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
