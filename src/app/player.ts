import { C, F, Random, S, stime, type Constructor, type XYWH } from "@thegraid/common-lib";
import { UtilButton, type Paintable, type RectShape, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Shape, type Graphics } from "@thegraid/easeljs-module";
import { Meeple, newPlanner, NumCounterBox, Player as PlayerLib, type DragContext, type Hex1, type HexMap, type IHex2, type NumCounter } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import { GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { MeepleShape } from "./meeple-shape";
import { OrthoHex, OrthoHex2 } from "./ortho-hex";
import { TP } from "./table-params";

// do not conflict with AF.Colors
const playerColors = ['violet', 'lightblue', 'orange', 'teal', 'lightgreen', 'goldenrod', 'brown', 'tan', 'yellow', ] as const;

export type PlayerColor = typeof playerColors[number];
export class Player extends PlayerLib {
  static initialCoins = 400;
  // set our multi-player colors (concept from Ankh?); we don't use the TP.colorScheme
  static { PlayerLib.colorScheme = playerColors.concat() }
  static override colorScheme: PlayerColor[];

  static override allPlayers: Player[];

  override get color(): PlayerColor { return super.color as PlayerColor; }
  override set color(c: PlayerColor) { super.color = c; }

  override get meeples() { return super.meeples as ColMeeple[]; }

  declare gamePlay: GamePlay;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
  }

  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  override newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    super.newGame(gamePlay, url);
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  // only invoked on the newly curPlayer!
  override newTurn() {
    // nothing to do... until 'Move' action.
    // this.ships.forEach(ship => ship.newTurn());
    // return;
  }

  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  override playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.plyrId}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // continue any semi-auto moves
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }

  // 2 score counters (advancing on track)
  // [AvailGreen, ChoosenYellow, UsedRed-disabled]
  // 4 CoinBid cards (shrink to buttons, disable when played)
  // nc ColSelect cards (shrink to buttons)
  //
  override makePlayerBits(): void {
    super.makePlayerBits()
    if (this.index >= 6) {
      this.gamePlay.table.dragger.makeDragable(this.panel)
    }
    this.makeCardButtons(TP.mHexes);  // number of columns
    this.setupCounters();
  }

  makeCardButtons(ncol = 4, ncoin = 4) {
    const opts = { fontSize: 30, visible: true, bgColor: this.color, player: this }
    const { width, height } = new ColSelButton(0, opts).getBounds(); // temp Button to getBounds()
    const { wide, gap } = this.panel.metrics, gap2 = gap / 2, dx = width + gap2;
    const dy = height + gap;
    const makeButton = (claz: Constructor<CardButton>, num: number, row = 0) => {
      const x0 = (width / 2) + (wide - (num * dx - gap2)) / 2;
      const y0 = (height / 2) + gap;
      const rv: CardButton[] = [];
      for (let ndx = 0; ndx < num; ndx++) {
        const button = new claz(ndx + 1, opts)
        button.x = x0 + dx * ndx;
        button.y = y0 + dy * row;
        this.panel.addChild(button);
        rv.push(button)
      }
      return rv;
    }
    this.colSelButtons = makeButton(ColSelButton, ncol, 0) as ColSelButton[];
    this.coinBidButtons = makeButton(CoinBidButton, ncoin, 1) as CoinBidButton[];
    return;
  }
  colSelButtons!: ColSelButton[];
  coinBidButtons!: CoinBidButton[];
  /** at start of round */
  clearButtons() {
    this.colSelButtons.forEach(b => b.setState())
    this.coinBidButtons.forEach(b => (b.setState(), b.bidOnCol = undefined))
  }
  isDoneSelecting() {
    return (
      this.colSelButtons.find(cb => cb.state === true) &&
      this.coinBidButtons.find(cb => cb.state === true))
  }
  commitCards() {
    const csb = this.colSelButtons.find(b => b.state === true);
    const cbb = this.coinBidButtons.find(b => b.state === true);
    if (csb) { csb.setState(false); };
    if (cbb) { cbb.setState(false); cbb.bidOnCol = csb!?.colNum - 1 };
  }

  xtraCol(ncols = 4) {
    return Random.random(ncols)
  }

  // meeple is Tile with (isMeep==true); use MeepleShape as baseShape?
  makeMeeples(map: HexMap<OrthoHex>) {
    const [nrows, ncols] = map.nRowCol;
    const xtraCol = this.xtraCol(ncols);
    const cmap = map// this.gamePlay.table.hexMap;
    const makeMeep = (col: number) => {
      const meep = new ColMeeple(`Meep-${this.index}:${col}`, this)
      meep.paint(this.color);
      const hex = cmap.getHex({ row: nrows - 1, col });
      if (hex.card) hex.card.addMeep(meep);
    }
    for (let col = 0; col < ncols; col++) { makeMeep(col) }
    makeMeep(xtraCol);
  }

  scoreCounter!: NumCounter;
  override get score() { return this.scoreCounter?.getValue(); }
  override set score(v: number) { this.scoreCounter?.updateValue(v); }

  setupCounters() {
    // display coin counter:
    const { high, wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .5;
    const ic = this.score;
    const cc = this.scoreCounter = new NumCounterBox('score', ic, undefined, fs);
    cc.x = wide - 2 * gap; cc.y = high - (cc.high / 2 + 2 * gap);
    cc.boxAlign('right');
    this.panel.addChild(cc);

    // template for making add'tl counters:
    // const c1 = this.counter1 = new NumCounterBox('net', 0, 'violet', fs)
    // c1.x = 2 * gap; c1.y = high - (cc.high / 2 + 2 * gap);
    // c1.boxAlign('left');
    // this.panel.addChild(c1);
  }
  // counter1!: NumCounter;

  currentBid(col: number) {
    return this.colSelButtons[col].state !== true ? undefined :
      (this.coinBidButtons.find(but => but.state == true) as CoinBidButton).coinBid;
  }

  /** choose and return one of the indicated meeples */
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void) {
    // TODO: GUI: set dropFunc -> colMeep(meep)
    const meep = meeps[0];
    setTimeout(() => {
      colMeep(meep)
    })
    return;
  }
}

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
class ColSelButton extends CardButton {

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

class CoinBidButton extends CardButton {
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
