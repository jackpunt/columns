import { C, permute, S, stime } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, type DragInfo, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { H, Tile, TileSource, type DragContext, type HexDir, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { OrthoHex2 as Hex2, type OrthoHex as Hex1, type HexMap2 } from "./ortho-hex";
import { type ColTable, type ColTable as Table } from "./col-table";
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

  // invoked by constructor.super()
  override makeShape(): RectShape {
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

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const toHex = targetHex as Hex2, card = toHex.card;
    if (card && card !== this) card.moveCard(toHex, ctx);
    super.dropFunc(targetHex, ctx);
    // maybe set gameState.cardDone
    const gameState = ctx.gameState as GameState, fromHex = this.fromHex as Hex2;
    const plyr = (gameState.curPlayer as Player)
    const selfDrop = (fromHex == toHex);
    if (selfDrop) return;
    {
      setTimeout(() => {
        gameState.cardDone = this; // triggers setNextPlayer; which confuses markLegal()
      }, 0);
    }
  }

  override moveTo(hex: Hex1 | undefined): void {
    super.moveTo(hex)
  }

  /** hex contains card, which needs to be moved: */
  moveCard(hex: Hex2, ctx: DragContext) {
    // if hex is 'discards' --> let unitCollision stack them
    // if hex in player.cardRack[]: card.sendHome()
    // if hex is table.cardRack[0]: shift all cards up
    if (hex.Aname == 'discards') return;
    const plyr = ctx.gameState?.curPlayer as Player | undefined;
    if (plyr?.cardRack.includes(hex)) {
      const alt = plyr.cardRack.findIndex(hex => !hex.card)
      if (alt < 0) {
        this.sendHome(); // move player card to discards
      } else {
        this.moveTo(plyr.cardRack[alt]); // swap into empty slot
      }
    } else {
      const hexAry = plyr?.gamePlay.table.cardRack ?? [];
      const len = hexAry.length, ndx0 = hexAry.indexOf(hex);
      if (ndx0 !== 0) debugger; // not allowed to drop on other slots...

      const move1 = (card: ColCard, ndx: number) => {
        if (ndx == len) { card.sendHome(); return }
        const hex1 = hexAry[ndx], card1 = hex1.card;
        if (card1) move1(card1, ndx + 1);
        hex1.card = card;
        card.moveTo(hex1)
      }
      move1(this, ndx0 + 1);
    }
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


  static makeAllCards() {
    ColCard.cardByName.clear();
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
}

/** special PathCard with no rule, never gets picked/placed,
 * just sits on PathCard.source.hex; acts as a button
 */
export class CardBack extends ColCard {
  static bColor = 'lightgreen'
  static oText = 'click\nto\ndraw';
  static nText = '\n';
  /** dim card when clicked */
  dim(dim = true) {
    // this.dText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }

  constructor(Aname: string, public table: Table) {
    super(Aname)
    this.baseShape.paint(CardBack.bColor)
  }
  // makeDragable(), but do not let it actually drag:
  override isDragable(ctx?: DragContext): boolean {
    return false;
  }
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    // do not move or place this card...
  }
  clicked(evt?: MouseEvent) {
    if (this.table.gamePlay.gameState.cardDone) {
      return;
    }
    const card = ColCard.source.nextUnit();  // card.moveTo(srchex)
    if (card) {
      const pt = { x: evt?.localX ?? 0, y: evt?.localY ?? 0 }
      setTimeout(() => {
        this.dragNextCard(card, pt)
      }, 4);
    }
    return;
  }

  dragNextCard(card: ColCard, dxy = { x: 10, y: 10 }) {
    // this.table.dragger.clickToDrag(card);
    this.table.dragTarget(card, dxy)
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
    const { dxdc, dydr } = table.hexMap.xywh
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
    const { w } = table.hexMap.xywh; // hex WH
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
