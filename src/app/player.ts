import { Random, stime, type Constructor } from "@thegraid/common-lib";
import { newPlanner, NumCounterBox, Player as PlayerLib, type HexDir, type HexMap, type NumCounter } from "@thegraid/hexlib";
import { CardButton, CB, CoinBidButton, ColMeeple, ColSelButton } from "./col-meeple";
import { GamePlay } from "./game-play";
import { OrthoHex, type OrthoHex2 } from "./ortho-hex";
import { TP } from "./table-params";

// do not conflict with AF.Colors
const playerColors = ['violet', 'lightblue', 'tan', 'teal', 'yellow', 'orange', 'goldenrod', 'brown', 'lightgreen', ] as const;

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
    this.colSelButtons.forEach(b => b.setState(CB.clear))
    this.coinBidButtons.forEach(b => (b.setState(CB.clear), b.bidOnCol = undefined))
  }
  /** during CollectBids */
  isDoneSelecting() {
    return (
      this.colSelButtons.find(cb => cb.state === CB.selected) &&
      this.coinBidButtons.find(cb => cb.state === CB.selected))
  }
  /**
   * inPhase(ResolveWinner): If this Player bid on the indicated col, return the bid
   * @param col
   * @returns \{ plyr: this, bid: number }
   */
  bidOnCol(col: number) {
    return this.colSelButtons[col]?.state === CB.selected ? { plyr: this, bid:  this.currentBid()} : undefined
  }
  currentBid() {
    return (this.coinBidButtons.find(but => but.state === CB.selected) as CoinBidButton).coinBid;
  }

  /** End of turn */
  commitCards() {
    const csb = this.colSelButtons.find(b => b.state === CB.selected);
    const cbb = this.coinBidButtons.find(b => b.state === CB.selected);
    if (csb) { csb.setState(CB.done); };
    if (cbb) { cbb.setState(CB.done); cbb.bidOnCol = csb!?.colNum - 1 };
  }

  cancelBid(col: number, bid: number) {
    this.colSelButtons[col].setState(CB.cancel);
    this.coinBidButtons[bid].setState(CB.cancel);
  }

  xtraCol(ncols = 4) {
    return Random.random(ncols)
  }

  // meeple is Tile with (isMeep==true); use MeepleShape as baseShape?
  makeMeeples(map: HexMap<OrthoHex>) {
    const [nrows, ncols] = map.nRowCol;
    const xtraCol = this.xtraCol(ncols);
    const cmap = map// this.gamePlay.table.hexMap;
    const makeMeep = (col: number, ext='') => {
      const meep = new ColMeeple(`Meep-${this.index}:${col}${ext}`, this)
      meep.paint(this.color);
      const hex = cmap.getHex({ row: nrows - 1, col });
      if (hex.card) hex.card.addMeep(meep);
    }
    for (let col = 0; col < ncols; col++) { makeMeep(col) }
    makeMeep(xtraCol, '*');
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

  /** choose and return one of the indicated meeples */
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void) {
    // TODO: GUI: set dropFunc -> colMeep(meep)
    const meep = meeps.sort((a, b) => a.card.rank - b.card.rank)[0];
    setTimeout(() => {
      colMeep(meep)
    })
    return;
  }

  /** this player moves meep, and invokes bumpee.bumpMeeple.
   * invoke cb() when bump cascade if done (no bumpee, or bump to black)
   *
   * @param meep the meep that need to find a home
   * @param dir0 the direction for this bump (undefined for winningBidder)
   * @param cb callback when bump cascade is done
   * @returns
   */
  bumpMeeple(meep: ColMeeple, dir0?: HexDir, cb?: () => void) {
    const dir = dir0 ?? 'N';
    const card = (meep.card.hex.nextHex(dir) as OrthoHex2)?.card;// should NOT bump from black, but...
    card?.addMeep(meep);
    card?.stage?.update();
    // cb?.()
    return;
  }
}
