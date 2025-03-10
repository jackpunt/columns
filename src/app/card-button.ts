import { C, S, stime, type XYWH } from "@thegraid/common-lib";
import { CenterText, CircleShape, RectShape, UtilButton, type CountClaz, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Container, Graphics, Shape, type DisplayObject } from "@thegraid/easeljs-module";
import { Table, Tile } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import { ColTable } from "./col-table";
import type { Faction } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";


export namespace CB {
  export const clear = 'clear';
  export const selected = 'selected';
  export const done = 'done';
  export const cancel = 'cancel'; // rejected: tied for first
  export const outbid = 'outbid'; // rejected: low bidder
}
/** clear, selected, done */
export type CardButtonState = typeof CB.clear | typeof CB.selected | typeof CB.done | typeof CB.cancel | typeof CB.outbid;
type CardButtonOpts = UtilButtonOptions & TextInRectOptions & { player: Player, radius?: number }
export abstract class CardButton extends UtilButton { // > TextWithRect > RectWithDisp > Paintable Container
  static radius = .67 // * CardShape.onScreenRadius
  radius!: number;
  constructor(label: string, opts: CardButtonOpts) {
    const { bgColor, player, radius } = opts, rad = radius ?? CardButton.radius * CardShape.onScreenRadius;
    opts.fontSize = 30 * rad / 60;
    super(label, opts); // rectShape = RectShape(borders); label = disp = Text
    this.altRectShape(bgColor, rad); // rectShape = CardShape;
    this.player = player;
    this.mouseEnabled = true;
    this.on(S.click, this.onClick as any, this, false, player);
    this.radius = rad;

    // make dimmer & highlight:
    const dColor = C.rgba(C.grey92, .7), vert = true;
    this.addChild(this.dimmer = new CardShape(dColor, '', rad, vert)); // on Top
    this.addChildAt(this.highlight = new CardShape(C.BLACK, C.BLACK, rad, vert), 0); // under baseShape
    this.highlight.scaleX = 1.17; this.highlight.scaleY = 1.10; // 10 ~= 3/5 * 17
    this.addChild(this.canceled = this.makeCancelShape())
    this.addChild(this.outbid = this.makeOutbidShape())
    this.highlight.setRectRad({ s: 4 })
    this.setState(CB.clear);
  }
  player!: Player;

  /** for print version */
  addSideNum() {
    const rad = this.radius, ll = new CenterText(this.label.text, rad * .15, this.label.color)
    ll.x = -.36 * rad;
    ll.y = -.33 * 5/3 * rad;
    this.addChild(ll)
  }

  get showBidNow() {
    return TP.showAllBids || !this.player.useRobo
  }

  /** onClick: Select this card/button for CollectBids: all Players in parallel */
  select() {
    // radio button
    if (this.state === CB.selected) {
      this.setState(CB.clear); // toggle from selected to not selected
    } else if (this.state === CB.clear) {
      this.setState(CB.selected);
    } else { /** ignore click */}
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
  canceled!: DisplayObject;
  outbid!: DisplayObject;
  makeCancelShape() {
    const { width, height } = this.getBounds(), ss = width * .07, rad = width * .35 - 2 * ss;
    const back = new CircleShape(C.rgba(C.grey224, .5), rad * 1.1, '')
    const circ = new CircleShape('', rad, C.RED, new Graphics().ss(ss))
    const slash = new Shape()
    slash.graphics.ss(ss).s(C.RED).mt(-rad, 0).lt(rad, 0);
    slash.rotation = 45;
    const cancel = new Container()
    cancel.y = height / 2 - width / 2; // center on diagonal from bottom
    cancel.addChild(back, circ, slash)
    return cancel;
  }
  makeOutbidShape() {
    const { width, height } = this.getBounds(), ss = width * .07, rad = width * .35 - 2 * ss;
    const back = new CircleShape(C.rgba(C.grey224, .5), rad * 1.1, '')
    const dash = new Shape();
    dash.graphics.ss(ss).s(C.RED).mt(-rad, 0).lt(rad, 0);
    const outbid = new Container()
    outbid.y = height / 2 - width / 2; // center on diagonal from bottom
    outbid.addChild(back, dash)
    return outbid;
  }
  /**
   * set state and appearance of a CardButton
   * @param state [clear] clear, selected, done; [cancel, outbid: does not change state]
   * @param update [true] stage.update() after changes
   */
  setState(state: CardButtonState = CB.clear, update = true) {
    switch (state) {
      case CB.clear: {
        this.state = state;
        this.dimmer.visible = false;
        this.highlight.visible = false;
        this.canceled.visible = false;
        this.outbid.visible = false;
        break
      }
      case CB.selected: {
        // clear any previously selected button:
        this.plyrButtons.find(cb => cb.state === CB.selected)?.setState(CB.clear, false);
        this.dimmer.visible = false;
        this.highlight.visible = this.showBidNow;
        this.state = state;
        this.player.gamePlay.gameState.cardDone = this; // notify gamePlay
        break
      }
      case CB.done: {
        this.state = state;
        this.dimmer.visible = true;
        this.highlight.visible = false;
        break
      }
      case CB.cancel: {
        this.canceled.visible = true;
        break
      }
      case CB.outbid: {
        this.outbid.visible = true;
        break
      }
    }
    if (update) this.stage?.update()
  }

  showSelected(update = true) {
    if (this.state != CB.selected) return;
    this.highlight.visible = true;
    if (update) this.stage?.update()
  }

  inPlay(inPlay = true) {
    const played = (this.state == CB.selected || this.state == CB.done)
    return inPlay ? played : !played;
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
    this.rectShape = new CardShape(color, C.grey224, rad, true, rad * .03);
    this.addChildAt(this.rectShape, 0)
    this.alsoPickTextColor(); // label.color was already set, but in case fillc changes...
    this.setBoundsNull()
  }
  declare rectShape: CardShape;

  makeShape() {
    const { radius: rad, strokec } = this.rectShape;
    return new CardShape(strokec, strokec, rad, true)
  }
  makeBleed(bleed: number) {
    return (new Tile('bleed')).makeBleed.call(this, bleed)
  }
}

export class ColSelButton extends CardButton {
  static colNames = ['','A','B','C','D','E','F','G','H'];
  override get plyrButtons(): CardButton[] { return this.player.colSelButtons }

  constructor(public colNum = 0, opts: CardButtonOpts) {
    const colId = ColSelButton.colNames[colNum];
    super(`${colId}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `ColSel-${this.player?.index ?? '?'}:${colId}`;
    this.colId = colId;
    const { y, height } = this.getBounds()
    this.label.y = (y + height / 5)
    this.border = 0;
    this.paint();
  }
  colId!: string
}

export class ColBidButton extends CardButton {
  // indices into ColCard.factionColors
  static coinFactions: Faction[][] = [[], [2, 4, 1, 3, ], [1, 3], [2, 4], [0]];

  override get plyrButtons(): CardButton[] { return this.player.colBidButtons }

  /**
   *
   * @param colBid value: 1..4
   * @param opts
   */
  constructor(public colBid = 0, opts: CardButtonOpts) {
    super(`${colBid}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `ColBid-${this.player?.index ?? '?'}:${colBid}`;
    const { y, height, width } = this.getBounds()
    this.addFactionColors(colBid, width * .9, y + height * .33)
    this.label.y = (y + height * .18)
    this.border = 0;
    this.paint();
  }

  bidOnCol?: number; // debug or post-hoc analysis
  factions!: Faction[];
  facShape!: Shape;
  addFactionColors(colBid = 0, width = 20, y = 0) {
    const factions = this.factions = ColBidButton.coinFactions[colBid];
    const colors = factions.map(n => ColCard.factionColors[n])
    const facShape = this.facShape = new Shape(), n = colors.length, g = facShape.graphics;
    const d2 = width;
    switch (n) {
      case 1: this.oneRect(g, colors, d2); break;
      case 2: this.twoRect(g, colors, d2); break;
      case 4: this.fourRect(g, colors, d2); break;
    }
    facShape.y = y;
    this.addChild(facShape)
  }

  addSideIcon() {
    const fIcon = new Shape(this.facShape.graphics);
    fIcon.scaleX = fIcon.scaleY = .20
    fIcon.x = -.36 * this.radius;
    fIcon.y = -.28 * 5/3 * this.radius;
    this.addChild(fIcon)

  }

  fourRect(g: Graphics, c: string[], d2 = 20, r = d2 * .05) {
    const d = d2 / 2;
    g.ss(1).s(C.black)
    g.f(c[2]).rc(-d, 0, d, d, r, 0, 0, 0)
    g.f(c[0]).rc(+0, 0, d, d, 0, r, 0, 0)
    g.f(c[1]).rc(+0, d, d, d, 0, 0, r, 0)
    g.f(c[3]).rc(-d, d, d, d, 0, 0, 0, r)
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

export class PrintColSelect extends ColSelButton {
  static seqN = 1;
  static countClaz(n: number, pid: number, rad = 525): CountClaz[] {
    return [[n, PrintColSelect, n, pid, rad]];
  }

  constructor(seqLim: number, pid: number, radius: number) {
    const allPlayers = (Table.table as ColTable).gamePlay.allPlayers;
    if (PrintColSelect.seqN > seqLim) PrintColSelect.seqN = seqLim > 0 ? 1 : 0;
    const col = PrintColSelect.seqN++, player = allPlayers[pid], bgColor = player.color;
    const opts: CardButtonOpts = { visible: true, bgColor, player, radius }
    super(col, opts)
    this.addSideNum();
    const { x, y, width, height } = this.getBounds()
    this.cache(x, y, width, height)
  }
}

export class PrintBidValue extends ColBidButton {
  static seqN = 1;
  static countClaz(n: number, pid: number, rad = 525): CountClaz[] {
    return [[n, PrintBidValue, n, pid, rad]]
  }

  constructor(seqLim: number, pid: number, radius: number) {
    const allPlayers = (Table.table as ColTable).gamePlay.allPlayers;
    if (PrintBidValue.seqN > seqLim) PrintBidValue.seqN = 1;
    const col = PrintBidValue.seqN++, player = allPlayers[pid], bgColor = player.color;
    const opts: CardButtonOpts = { visible: true, bgColor, player, radius }
    super(col, opts)

    this.addSideNum();
    this.addSideIcon();

    const { x, y, width, height } = this.getBounds()
    this.cache(x, y, width, height)
  }
}
