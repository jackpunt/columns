import { C, F, S, stime, type XYWH } from "@thegraid/common-lib";
import { CircleShape, UtilButton, type Paintable, type RectShape, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Graphics, Shape } from "@thegraid/easeljs-module";
import { Meeple, Player as PlayerLib, type DragContext, type Hex1, type IHex2, type MeepleShape as MeepleShapeLib } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import type { GameState } from "./game-state";
import { MeepleShape } from "./meeple-shape";
import { OrthoHex2 } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";


export class ColMeeple extends Meeple {

  declare player: Player;
  declare baseShape: MeepleShapeLib & { highlight(l?: boolean): void };
  declare static allMeeples: ColMeeple[];

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
  faction?: number;
  override makeShape(): Paintable {
    const x = TP.hexRad / 2, y = x * (5 / 3);
    return new MeepleShape(this.player?.color ?? 'pink', { x, y })
  }
  highlight(lightup = true) {
    this.baseShape.highlight(lightup);
    this.updateCache()
  }

  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    const state = ctx.gameState.state.Aname;
    if (state !== 'BumpAndCascade' && ! ctx.lastShift)
      return `Only move during Bump phase, not "${state}"`;
    const col = (ctx.gameState as GameState).gamePlay.colToMove;
    const colc = this.card.col;
    return (colc == col || ctx.lastShift) ? undefined : `Only move from column ${col}, not ${colc}`;
  }

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    if (!(toHex instanceof OrthoHex2)) return false;
    if (ctx.lastShift && ctx.lastCtrl) return true;   // can shift cols with Ctrl
    if (!(toHex.col === this.hex!.col)) return false; // stay in same hex-column
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
      targetHex.card?.addMeep(this, undefined, xy); // drop
    } else {
      super.dropFunc(targetHex, ctx);
    }
  }
}

export namespace CB {
  export const clear = 'clear';
  export const selected = 'selected';
  export const done = 'done';
  export const cancel = 'cancel';
}
export type CardButtonState = typeof CB.clear | typeof CB.selected | typeof CB.done | typeof CB.cancel;

export abstract class CardButton extends UtilButton { // > TextWithRect > RectWithDisp > Paintable Container
  static radius = .7 // * ColCard.onScreenRadius
  constructor(label: string, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    const { bgColor, player } = opts, rad = CardButton.radius * ColCard.onScreenRadius;
    opts.fontSize = 30 * rad / 60;
    super(label, opts); // rectShape = RectShape(borders); label = disp = Text
    this.altRectShape(bgColor, rad); // rectShape = CardShape;
    this.player = player;
    this.mouseEnabled = true;
    this.on(S.click, this.onClick as any, this, false, player);

    // make dimmer & highlight:
    const dColor = 'rgba(100,100,100,.5)', vert = true;
    this.addChild(this.dimmer = new CardShape(dColor, '', rad, vert)); // on Top
    this.addChildAt(this.highlight = new CardShape(C.black, undefined, rad * 1.04, vert), 0); // under baseShape
    this.addChild(this.canceled = this.makeCancelShape())
    this.highlight.setRectRad({ s: 4 })
    this.setState(CB.clear);
  }
  player!: Player;

  /** Select this card/button for CollectBids: all Players in parallel */
  select() {
    // radio button
    if (this.state === CB.selected) {
      this.setState(CB.clear); // toggle from selected to not selected
    } else if (this.state === CB.clear) {
      // clear the previously selected button
      this.plyrButtons.find(cb => cb.state === CB.selected)?.setState(CB.clear, false);
      this.setState(CB.selected);
      setTimeout(() => {
        this.player.gamePlay.gameState.cardDone = this; // notify gamePlay
      }, 0);
    }
  }
  onClick(evt: any, player: Player) {
    const gs = this.player.gamePlay.gameState;
    if (!(gs.isPhase('CollectBids') || gs.isPhase('SelectCol'))) return;
    this.select()
    console.log(stime(`CardButton.onClick:`), this.Aname, this.state)
  }
  abstract get plyrButtons(): CardButton[]

  /** undef: clear; true: highlight; false: dim */
  state?: CardButtonState;
  dimmer!: RectShape;
  highlight!: RectShape;
  canceled!: Shape;
  makeCancelShape() {
    const { width, height } = this.getBounds(), ss = width * .07, rad = width * .35 - 2 * ss;
    const circ = new CircleShape('', rad, C.RED, new Graphics().ss(ss))
    circ.y = height / 2 - width / 2; // center on diagonal from bottom
    return circ;
  }
  /**
   *
   * @param state [clear] clear, light, done, cancel (does not change state)
   * @param update [true] stage.update after changes
   */
  setState(state: CardButtonState = CB.clear, update = true) {
    const pstate = this.state;
    this.state = state;
    switch (state) {
      case CB.clear: {
        this.dimmer.visible = false;
        this.highlight.visible = false;
        this.canceled.visible = false;
        break
      }
      case CB.selected: {
        this.dimmer.visible = false;
        this.highlight.visible = true;
        break
      }
      case CB.done: {
        this.dimmer.visible = true;
        this.highlight.visible = false;
        break
      }
      case CB.cancel: {
        this.canceled.visible = true;
        this.state = pstate;
        break
      }
    }
    if (update) this.stage?.update()
  }


  // ignore label size & borders:
  override calcBounds(): XYWH {
    super.calcBounds()
    const { x, y, width: w, height: h } = this.rectShape.getBounds()
    return { x, y, w, h };
  }

  /** replace UtilButton's border RectShape with CardShape */
  altRectShape(color = C.WHITE, rad = CardButton.radius) {
    this.removeChild(this.rectShape);
    this.rectShape = new CardShape(color, undefined, rad, true);
    this.addChildAt(this.rectShape, 0)
    this.alsoPickTextColor(); // label.color was already set, but in case fillc changes...
    this.setBoundsNull()
  }
}
export class ColSelButton extends CardButton {

  override get plyrButtons(): CardButton[] { return this.player.colSelButtons }

  constructor(public colNum = 0, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(`${colNum}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `ColSel-${this.player.index}:${colNum}`;
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
  // indices into ColCard.factionColors
  static coinFactions = [[], [2, 4, 1, 3, ], [1, 3], [2, 4], [0]];

  override get plyrButtons(): CardButton[] { return this.player.coinBidButtons }

  /**
   *
   * @param coinBid value: 1..4
   * @param opts
   */
  constructor(public coinBid = 0, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(`${coinBid}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `CoinBid-${this.player.index}:${coinBid}`;
    const { y, height, width } = this.getBounds()
    this.addFactionColors(coinBid, width * .9, y + height * .33)
    this.label.y = (y + height * .18)
    this.border = 0;
    this.paint();
  }
  override onClick(evt: any, plyr: Player) {
    super.onClick(evt, plyr)
  }
  bidOnCol?: number; // debug or post-hoc analysis
  factions!: number[];
  addFactionColors(coinBid = 0, width = 20, y = 0) {
    const factions = this.factions = CoinBidButton.coinFactions[coinBid];
    const colors = factions.map(n => ColCard.factionColors[n])
    const facShape = new Shape(), n = colors.length, g = facShape.graphics;
    const d2 = width;
    switch (n) {
      case 1: this.oneRect(g, colors, d2); break;
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
