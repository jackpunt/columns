import { arrayN, C, S, stime, type XYWH } from "@thegraid/common-lib";
import { CenterText, CircleShape, RectShape, UtilButton, type CountClaz, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Container, Graphics, Shape, type DisplayObject } from "@thegraid/easeljs-module";
import { Table, Tile } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { Decorator } from "./col-card";
import { type ColTable } from "./col-table";
import { FacShape } from "./fac-shape";
import type { } from "./game-play";
import { Player } from "./player";
import { Statics, type ColId, type Faction } from "./statics";
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
type CardButtonOpts = UtilButtonOptions & TextInRectOptions
      & { player: Player, pid?: number, radius?: number, strokec?: string, ssm?: number }
export abstract class CardButton extends UtilButton { // > TextWithRect > RectWithDisp > Paintable Container

  static gridSpec = Statics.cardSingle_1_75_in;  // set in TileExporter
  static getWH(cardw = 525, vert = true) { return CardShape.getWH(cardw, CardButton.gridSpec, vert)}

  static radius = .67 // * CardShape.onScreenRadius
  radius!: number;
  constructor(label: string, opts: CardButtonOpts) {
    const { bgColor, player, radius, strokec, ssm } = opts, rad = radius ?? CardButton.radius * CardShape.onScreenRadius;
    opts.fontSize = rad * 28 / TP.hexRad;
    super(label, opts); // rectShape = RectShape(borders); label = disp = Text
    this.altRectShape(bgColor, rad, strokec, ssm); // rectShape = CardShape;
    this.player = player;
    this.mouseEnabled = true;
    this.on(S.click, this.onClick as any, this, false, player);
    this.radius = rad;

    // make dimmer & highlight:
    const dColor = C.rgba(C.grey92, .7), vert = true;
    const wh = CardButton.getWH(rad, vert)
    this.addChild(this.dimmer = new CardShape(dColor, '', wh, vert)); // on Top
    this.addChildAt(this.highlight = new CardShape(C.BLACK, C.BLACK, wh, vert), 0); // under baseShape
    this.highlight.scaleX = 1.17; this.highlight.scaleY = 1.10; // 10 ~= 3/5 * 17
    this.addChild(this.canceled = this.makeCancelShape())
    this.addChild(this.outbid = this.makeOutbidShape())
    this.highlight.setRectRad({ s: 4 })
    this.setState(CB.clear);
  }
  player!: Player;

  _sideNum!: CenterText;
  set sideNum(txt: string) { this._sideNum.text = txt }
  /** small text in upper-left; for print version */
  addSideNum(txt = this.label.text, ds = .15) {
    const rad = this.radius
    const ll = this._sideNum = new CenterText(txt, rad * ds, this.label.color)
    ll.x = (-.366 +.03 * ds/.15) * rad; // -.36 * rad
    ll.y = (-.60 +.05 * ds/.15) * rad; // .33 * 5/3 * rad
    this.addChild(ll)
  }

  get showBidNow() {
    return TP.showAllBids || !this.player.useRobo
  }

  /** onClick: Select this card/button for CollectBids: all Players in parallel */
  select(show = false) {
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
    this.select(); // actual/physical click (vs robo select)
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
    slash.rotation = 45;  // CancelShape
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
        this._sideNum && (this.sideNum = '');
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

  /** replace UtilButton's border RectShape with CardShape
   * @param ssm ss multiplier (.03) for thin line on screen; .069 for MPC (36px)
  */
  altRectShape(color = C.WHITE, rad = CardButton.radius, strokec = C.grey224, ssm = .03) {
    this.removeChild(this.rectShape);
    const wh = CardButton.getWH(rad, true);
    this.rectShape = new CardShape(color, strokec, wh, true, rad * ssm); // border line
    this.addChildAt(this.rectShape, 0)
    this.alsoPickTextColor(); // label.color was already set, but in case fillc changes...
    this.setBoundsNull()
  }
  declare rectShape: CardShape;

  makeShape() {
    const { radius: rad, strokec } = this.rectShape;
    const wh = CardButton.getWH(rad, true);
    return new CardShape(strokec, strokec, wh, true)
  }
  makeBleed(bleed: number) {
    return (new Tile('bleed')).makeBleed.call(this, bleed)
  }
}

export class ColSelButton extends CardButton {
  override get plyrButtons(): CardButton[] { return this.player.colSelButtons }

  constructor(public colNum = 0, opts: CardButtonOpts) {
    const colId = Statics.colNames[colNum];
    super(`${colId}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `Hand${this.player?.index ?? opts.pid ?? '?'}_Sel${colId}`;
    this.colId = colId;
    const { y, height } = this.getBounds()
    this.label.y = (y + height * .21)
    this.border = 0;
    this.addSideNum('', .3);
    this.paint();
  }
  colId!: ColId;
  override onClick(evt: any, player: Player): void {
    super.onClick(evt, player);
    player.showMeepsInCol()
  }
}

export class ColBidButton extends CardButton {
  // indices into ColCard.factionColors

  override get plyrButtons(): CardButton[] { return this.player.colBidButtons }

  /**
   *
   * @param colBid value: 1..4
   * @param opts
   */
  constructor(public colBid = 0, opts: CardButtonOpts) {
    super(`${colBid}`, opts); // rectShape = RectShape(borders); label = disp = Text
    this.Aname = `Hand${this.player?.index ?? opts.pid ?? '?'}_Bid${colBid}`;
    const { y, height, width } = this.getBounds()
    const w = width * .8;
    this.addFactionColors(colBid, w, y + height * .36)
    this.label.y = (y + height * .21)
    this.border = 0;
    this.addSideNum('', .3);
    this.addColorIcons(w)
    this.paint();
  }

  override onClick(evt: any, player: Player): void {
    super.onClick(evt, player);
    player.showMeepsInCol();
  }

  bidOnCol?: number; // debug or post-hoc analysis
  factions!: Faction[];
  facShape!: Shape;
  addFactionColors(colBid = 0, width = 20, y = 0) {
    const facShape = this.facShape = new FacShape();
    this.factions = facShape.facRect(colBid, width, y); // factions = Statics.bidFactions(colBid);
    this.addChild(facShape)
  }

  addSideIcon() {
    const fIcon = new Shape(this.facShape.graphics);
    fIcon.scaleX = fIcon.scaleY = .16
    fIcon.x = -.336 * this.radius;
    fIcon.y = -.28 * 5/3 * this.radius;
    this.addChild(fIcon)
  }

  /**
   *
   * @param w width of square; (h = w/2)
   * @returns
   */
  addColorIcons(w: number) {
    const nfacs = this.factions.length;
    if (nfacs == 1 || nfacs == 4) return; // no icon on 4-color or single color
    const dx = [0, 0, 0, 0, w/4][nfacs], deco = new Decorator(w, .18);
    arrayN(nfacs).forEach(ndx => {
      const icon = deco.icon(this.factions[ndx]);
      icon.x = [dx, dx, -dx, -dx][ndx], icon.y = [0, w/2, 0, w/2][ndx] ;
      this.addChild(icon);
    })
  }
}

export class PrintColSelect extends ColSelButton {
  static seqN = 1;
  static seqLim = 8;  // seqLim given in countClaz (max number of players)
  static nextSeqN(seqLim = PrintColSelect.seqLim) {
    if (PrintColSelect.seqN > seqLim) PrintColSelect.seqN = 1;
    return PrintColSelect.seqN++
  }

  static countClaz(n: number, pid: number, rad = 525): CountClaz[] {
    PrintColSelect.seqLim = n;
    PrintColSelect.seqN = 1;
    return [[n, PrintColSelect, pid, rad]];
  }

  constructor(pid: number, radius: number) {
    const allPlayers = (Table.table as ColTable).gamePlay.allPlayers;
    const col = PrintColSelect.nextSeqN();
    const player = allPlayers[pid], bgColor = Player.playerColor(pid);
    const opts: CardButtonOpts = { visible: true, bgColor, player, pid, radius }
    super(col, opts)
    this.addSideNum();
    const { x, y, width, height } = this.getBounds()
    this.cache(x, y, width, height)
  }
}

export class PrintBidValue extends ColBidButton {
  static seqN = 1;
  static seqLim = 4;
  static nextSeqN(seqLim = PrintBidValue.seqLim) {
    if (PrintBidValue.seqN > seqLim) PrintBidValue.seqN = 1;
    return PrintBidValue.seqN++
  }
  static countClaz(n: number, pid: number, rad = 525): CountClaz[] {
    return [[n, PrintBidValue, pid, rad]]
  }

  constructor(pid: number, radius: number) {
    const allPlayers = (Table.table as ColTable).gamePlay.allPlayers;
    const bid = PrintBidValue.nextSeqN();
    const player = allPlayers[pid], bgColor = Player.playerColor(pid);
    const ssm = (36)/radius;     // see also: CardShape.ssm
    const opts: CardButtonOpts = { visible: true, bgColor, player, pid, radius, ssm }
    super(bid, opts)

    this.addSideNum();
    this.addSideIcon();

    const { x, y, width, height } = this.getBounds()
    this.cache(x, y, width, height)
  }
}

/** Make a ColSelButton with '' ColName */
export class ColButtonBack extends ColSelButton {
  static seqN = 1;
  static seqLim = 4;
  static nextSeqN(seqLim = ColButtonBack.seqLim) {
    if (ColButtonBack.seqN > seqLim) ColButtonBack.seqN = 1;
    return ColButtonBack.seqN++
  }
  static countClaz(n: number, ...args: any[]): CountClaz[] {
    ColButtonBack.seqLim = n;
    ColButtonBack.seqN = 1;
    return [[n, ColButtonBack, ...args]];
  }

  constructor(opts: CardButtonOpts) {
    const n = ColButtonBack.nextSeqN();
    super(0, opts);
    this.Aname = this.Aname.replace('_Sel', `_Back${String(n).padStart(2, '0')}`)
  }
}
