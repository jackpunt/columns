import { C, F, Random, S, stime, type Constructor, type XYWH } from "@thegraid/common-lib";
import { UtilButton, type Paintable, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { Shape, type Graphics } from "@thegraid/easeljs-module";
import { Meeple, newPlanner, NumCounterBox, Player as PlayerLib, type HexMap, type NumCounter } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import { GamePlay } from "./game-play";
import { MeepleShape } from "./meeple-shape";
import type { OrthoHex } from "./ortho-hex";
import { TP } from "./table-params";

// do not conflict with AF.Colors
const playerColors = ['violet', 'lightblue', 'orange', 'teal', 'lightgreen', 'goldenrod', 'brown', 'tan', 'yellow', ] as const;

export type PlayerColor = typeof playerColors[number];
export class Player extends PlayerLib {
  static initialCoins = 400;
  // set our multi-player colors (concept from Ankh?); we don't use the TP.colorScheme
  static { PlayerLib.colorScheme = playerColors.concat() }
  static override colorScheme: PlayerColor[];
  override get color(): PlayerColor {
    return super.color as PlayerColor;
  }
  override set color(c:  PlayerColor) {
    super.color = c;
  }

  declare gamePlay: GamePlay;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
  }

  static override allPlayers: Player[];

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
    // this.setupCounters();
  }

  makeCardButtons(ncol = 4, ncoin = 4) {
    const opts = { fontSize: 30, visible: true, bgColor: this.color, player: this }
    const but0 = new CardButton('0', opts)
    const { width, height } = but0.getBounds();
    const { wide, gap } = this.panel.metrics, gap2 = gap / 2, dx = width + gap2;
    const dy = height + gap;
    const makeButton = (claz: Constructor<CardButton>, num: number, row = 0) => {
      const x0 = (width / 2) + (wide - (num * dx - gap2)) / 2;
      const y0 = (height / 2) + gap;
      for (let ndx = 0; ndx < num; ndx++) {
        const button = new claz(ndx + 1, opts)
        button.x = x0 + dx * ndx;
        button.y = y0 + dy * row;
        this.panel.addChild(button);
      }
    }
    makeButton(ColSelButton, ncol, 0);
    makeButton(CoinBidButton, ncoin, 1);
    // this.makeMeeples(ncol)
    return;
  }

  // meeple is Tile with (isMeep==true); use MeepleShape as baseShape?
  makeMeeples(map: HexMap<OrthoHex>, xtraCol?: number) {
    Meeple.allMeeples.length = 0;    // reset all Meeples; should be in Tile.clearAllTiles() ?
    const [nrows, ncols] = map.nRowCol;
    if (xtraCol == undefined) xtraCol = Random.random(map.nRowCol[1])
    const cmap = this.gamePlay.table.hexMap;
    for (let col = 0; col < ncols; col++) {
      const meep = new ColMeeple(`Meep-${col}`, this)
      meep.paint(this.color);
      const hex = cmap.getHex({ row: nrows - 1, col });
      // if (!hex.meep) meep.moveTo(hex)
      if (!hex.meep) hex.meep = meep;
    }
  }

  setupCounters() {
    // display coin counter:
    const { high, wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .7;
    const ic = this.coins;
    const cc = this.coinCounter = new NumCounterBox('coins', ic, undefined, fs);
    cc.x = wide - 2 * gap; cc.y = high - (cc.high / 2 + 2 * gap);
    cc.boxAlign('right');
    this.panel.addChild(cc);

    const c1 = this.counter1 = new NumCounterBox('net', 0, 'violet', fs)
    c1.x = 2 * gap; c1.y = high - (cc.high / 2 + 2 * gap);
    c1.boxAlign('left');
    this.panel.addChild(c1);
  }
  counter1!: NumCounter;
}

class ColMeeple extends Meeple {

  constructor(Aname: string, player?: Player) {
    super(Aname, player)
    this.nameText.font = F.fontSpec(this.radius / 6)
    this.nameText.y -= 3;
    console.log(stime(`ColMeeple: constructor`), this);
    this.paint(player?.color, true)
  }
  override makeShape(): Paintable {
    return new MeepleShape(this.player?.color ?? 'pink', { x: 30, y: 50 })
  }
}

class CardButton extends UtilButton { // > TextWithRect > RectWithDisp > Paintable Container
  constructor(label: string, opts: UtilButtonOptions & TextInRectOptions & { player: Player }) {
    super(label, opts); // rectShape = RectShape(borders); label = disp = Text
    const { bgColor } = opts;
    this.altRectShape(bgColor); // rectShape = CardShape;
    const { player } = opts;
    this.player = player;
    this.mouseEnabled = true;
    this.on(S.click, this.onClick as any, this, false, player);
  }
  player!: Player;
  onClick(evt: any, player: Player) {
    console.log(stime(`CardButton.onClick:`), this.Aname)
  }

  // ignore label size & borders:
  override calcBounds(): XYWH {
    super.calcBounds()
    const { x, y, width: w, height: h } = this.rectShape.getBounds()
    return { x, y, w, h };
  }

  altRectShape(color = C.WHITE) {
    const scale = .7, rad = scale * ColCard.onScreenRadius;
    this.removeChild(this.rectShape);
    this.rectShape = new CardShape(color, undefined, rad, true);
    this.addChildAt(this.rectShape, 0)
    this.alsoPickTextColor(); // label.color was already set, but in case fillc changes...
    this.setBoundsNull()
  }
}
class ColSelButton extends CardButton {

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
