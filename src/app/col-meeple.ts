import { C, F, S, stime, type XYWH } from "@thegraid/common-lib";
import { UtilButton, type Paintable, type RectShape, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Shape, type Graphics } from "@thegraid/easeljs-module";
import { Meeple, Player as PlayerLib, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import type { GameState } from "./game-state";
import { MeepleShape } from "./meeple-shape";
import { OrthoHex2 } from "./ortho-hex";
import type { Player } from "./player";


export class ColMeeple extends Meeple {

  declare player: Player;

  constructor(Aname: string, player?: Player) {
    super(Aname, player)
    this.nameText.font = F.fontSpec(this.radius / 6)
    this.nameText.y -= 3;
    // console.log(stime(`ColMeeple: constructor`), this);
  }
  /** ColCard maintains: indicates which cell of card this meeple occupies; -> locXY */
  cellNdx?: number;
  /** ColCard on which this meeple is placed */
  card!: ColCard;
  /** faction of cell (of card) meeple is in/on. */
  faction!: number;
  override makeShape(): Paintable {
    return new MeepleShape(this.player?.color ?? 'pink', { x: 30, y: 50 })
  }

  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    const state = ctx.gameState.state.Aname;
    if (state !== 'BumpAndCascade' && ! ctx.lastShift)
      return `Only move during Bump phase, not "${state}"`;
    const col = (ctx.gameState as GameState).gamePlay.colToMove;
    const colc = this.card.hex.col;
    return (colc == col || ctx.lastShift) ? undefined : `Only move from column ${col}, not ${colc}`;
  }

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    if (!(toHex instanceof OrthoHex2)) return false;
    if (!(toHex.col === this.hex!.col)) return false; // stay in same column
    if (ctx.lastShift) return true;
    // if (toHex === this.fromHex) return true;
    if (!(ctx.gameState.isPhase('BumpAndCascade'))) return false;
    return true;
  }

  // hex.card.addMeep(this)
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (targetHex instanceof OrthoHex2) {
      const xy = this.parent.localToLocal(this.x, this.y, targetHex.card!.meepCont);
      this.hex = targetHex; // record for later use as fromHex
      targetHex.card?.addMeep(this, undefined, xy);
    } else {
      super.dropFunc(targetHex, ctx);
    }
  }
}

export abstract class CardButton extends UtilButton { // > TextWithRect > RectWithDisp > Paintable Container
  static radius = .7 // * ColCard.onScreenRadius
  constructor(label: string, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(label, opts); // rectShape = RectShape(borders); label = disp = Text
    const { bgColor } = opts;
    this.altRectShape(bgColor); // rectShape = CardShape;
    const { player } = opts;
    this.player = player;
    this.mouseEnabled = true;
    this.on(S.click, this.onClick as any, this, false, player);

    // make dimmer & highlight:
    const dColor = 'rgba(100,100,100,.5)', rad = CardButton.radius, vert = true;
    this.addChild(this.dimmer = new CardShape(dColor, '', rad, vert)); // on Top
    this.addChildAt(this.highlight = new CardShape(C.black, undefined, rad * 1.04, vert), 0); // under baseShape
    this.highlight.setRectRad({ s: 4 })
    this.setState();
  }
  player!: Player;

  select() {
    // radio button
    if (this.state === true) {
      this.setState(); // toggle from selected to not selected
    } else if (this.state === undefined) {
      // clear the previously selected button
      this.plyrButtons.find(cb => cb.state === true)?.setState(undefined, false);
      this.setState(true);
      setTimeout(() => {
        this.player.gamePlay.gameState.cardDone = this; // notify gamePlay
      }, 0);
    }
  }
  onClick(evt: any, player: Player) {
    this.select()
    console.log(stime(`CardButton.onClick:`), this.Aname, this.state)
  }
  abstract get plyrButtons(): CardButton[]

  /** undef: clear; true: highlight; false: dim */
  state?: boolean;
  dimmer!: RectShape;
  highlight!: RectShape;

  /**
   *
   * @param state [undefined] undef: clear; true: highlight; false: dim
   * @param update [true] stage.update after changes
   */
  setState(state?: boolean, update = true) {
    if (state === undefined) {
      this.dimmer.visible = false;
      this.highlight.visible = false;
    } else if (state === true) {
      this.dimmer.visible = false;
      this.highlight.visible = true;
    } else if (state === false) {
      this.dimmer.visible = true;
      this.highlight.visible = false;
    } else {
      debugger;
    }
    this.state = state;
    if (update) this.stage?.update()
  }


  // ignore label size & borders:
  override calcBounds(): XYWH {
    super.calcBounds()
    const { x, y, width: w, height: h } = this.rectShape.getBounds()
    return { x, y, w, h };
  }

  altRectShape(color = C.WHITE) {
    this.removeChild(this.rectShape);
    this.rectShape = new CardShape(color, undefined, CardButton.radius, true);
    this.addChildAt(this.rectShape, 0)
    this.alsoPickTextColor(); // label.color was already set, but in case fillc changes...
    this.setBoundsNull()
  }
}
export class ColSelButton extends CardButton {

  override get plyrButtons(): CardButton[] { return this.player.colSelButtons }

  constructor(public colNum = 0, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(`${colNum}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `ColSel-${colNum}:${this.player.index}`;
    const { y, height } = this.getBounds()
    this.label.y = (y + height / 5)
    this.border = 0;
    this.paint();
  }
  override onClick(evt: any, plyr: Player) {
    super.onClick(evt, plyr)
  }
}

export class CoinBidButton extends CardButton {
  static coinFactions = [[], [1, 2, 3, 4], [3, 4], [1, 2], []]; // indices into ColCard.factionColors

  override get plyrButtons(): CardButton[] { return this.player.coinBidButtons }

  constructor(public coinBid = 0, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(`${coinBid}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `CoinBid-${coinBid}:${this.player.index}`;
    const { y, height, width } = this.getBounds()
    this.addFactionColors(coinBid, width * .9, y + height * .33)
    this.label.y = (y + height * .18)
    this.border = 0;
    this.paint();
  }
  override onClick(evt: any, plyr: Player) {
    super.onClick(evt, plyr)
  }
  bidOnCol?: number;
  factions!: number[];
  addFactionColors(coinBid = 0, width = 20, y = 0) {
    const factions = this.factions = CoinBidButton.coinFactions[coinBid];
    const colors = factions.map(n => ColCard.factionColors[n])
    const facShape = new Shape(), n = colors.length, g = facShape.graphics;
    const d2 = width;
    switch (n) {
      case 0: this.oneRect(g, [C.grey128], d2); break;
      case 2: this.twoRect(g, colors, d2); break;
      case 4: this.fourRect(g, colors, d2); break;
    }
    facShape.y = y;
    this.addChild(facShape)
  }

  fourRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2;
    g.ss(1).s(C.black)
    g.f(c[0]).rc(-d, 0, d, d, r, 0, 0, 0)
    g.f(c[2]).rc(+0, 0, d, d, 0, r, 0, 0)
    g.f(c[3]).rc(+0, d, d, d, 0, 0, r, 0)
    g.f(c[1]).rc(-d, d, d, d, 0, 0, 0, r)
    return g
  }
  twoRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2
    g.ss(1).s(C.black)
    g.f(c[0]).rc(-d, 0, d2, d, r, r, 0, 0)
    g.f(c[1]).rc(-d, d, d2, d, 0, 0, r, r)
    return g
  }
  oneRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2
    g.ss(1).s(C.black)
    g.f(c[0]).rc(-d, 0, d2, d2, r, r, r, r)
    return g
  }
}
