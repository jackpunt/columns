import { C, Random, S, stime, type Constructor } from "@thegraid/common-lib";
import { UtilButton } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, Player as PlayerLib, type HexDir, type HexMap, type NumCounter, type PlayerPanel } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { CardButton, CB, CoinBidButton, ColMeeple, ColSelButton } from "./col-meeple";
import { GamePlay } from "./game-play";
import { OrthoHex, type OrthoHex2 } from "./ortho-hex";
import { TP } from "./table-params";

type PlyrBid = { plyr: Player; bid: number; }
/** interface from GamePlay/GameState to Player */
export interface IPlayer {
  makeMeeple(map: HexMap<OrthoHex>, col: number, rank?: number, ext?: string): ColMeeple;
  panel: PlayerPanel;
  score: number;
  color: string;
  meeples: ColMeeple[];
  coinBidButtons: CoinBidButton[]; // { state?: string, factions: number[] }
  clearButtons(): void; // reset CardButton: setState(CB.clear)
  selectCol(): void;    // for xtraCol
  collectBid(): void;
  isDoneSelecting(): ColSelButton | undefined; // { colNum: number } | undefined
  bidOnCol(col: number): PlyrBid | undefined;
  cancelBid(col: number, bid: number): void;
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void): void;
  bumpMeeple(meep: ColMeeple, dir0?: HexDir, cb?: () => void): void;
  commitCards(): void;
}

// do not conflict with AF.Colors
const playerColors = ['violet', 'lightblue', 'tan', 'teal', 'yellow', 'orange', 'goldenrod', 'brown', 'lightgreen', ] as const;

export type PlayerColor = typeof playerColors[number];
export class Player extends PlayerLib implements IPlayer {
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
    this.makeAutoButton();
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
  makeAutoButton() {
    const { high } = this.panel.metrics, fs = TP.hexRad / 2;
    const autoBut = new UtilButton('A', { visible: true, active: true, border: .1, fontSize: fs })
    autoBut.x = 0 + fs * .5; autoBut.y = high - fs * .6;
    this.panel.addChild(autoBut)
    autoBut.on(S.click, () => this.setAutoPlay(), this); // toggle useRobo
  }

  /** true: player auto-selects play; false: player uses GUI  */
  setAutoPlay(v = !this.useRobo) {
    this.useRobo = v;
  }

  colSelButtons!: ColSelButton[];
  coinBidButtons!: CoinBidButton[];
  /** at start of round */
  clearButtons() {
    this.colSelButtons.forEach(b => b.setState(CB.clear))
    this.coinBidButtons.forEach(b => (b.setState(CB.clear), b.bidOnCol = undefined))
  }
  /** during CollectBids (& chooseXtra) */
  isDoneSelecting() {
    return (
      this.coinBidButtons.find(cb => cb.state === CB.selected) &&
      this.colSelButtons.find(cb => cb.state === CB.selected)
      )
  }
  /**
   * inPhase(ResolveWinner): If this Player bid on the indicated col, return the bid
   * @param col column [1..nCols], index = col - 1
   * @returns \{ plyr: this, bid: number }
   */
  bidOnCol(col: number) {
    return this.colSelButtons[col - 1]?.state === CB.selected ? { plyr: this, bid: this.currentBid() } : undefined
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
    this.colSelButtons[col - 1].setState(CB.cancel);
    this.coinBidButtons[bid - 1].setState(CB.cancel);
  }

  selectCol() {
    const col = this.xtraCol()
    this.clearButtons();
    this.colSelButtons[col - 1].select()
    this.coinBidButtons[0].select(); // bid 1 to complete selection
  }
  collectBid() {
    // if not useRobo, nothing to do.
  }

  xtraCol(ncols = 4) {
    return 1 + Random.random(ncols)
  }

  // ColMeeple is Tile with (isMeep==true); use MeepleShape as baseShape
  /**
   *
   * @param hexMap
   * @param col column number --> hexMap(row, col-1)
   * @param row [0] rank --> hexMap(nrows - 1 - row, col-1)
   * @param ext [''] mark name of xtraCol meeple
   */
  makeMeeple(hexMap: HexMap<OrthoHex>, col: number, rank = 0, ext = '') {
    const [nrows, ncols] = hexMap.nRowCol;
    const meep = new ColMeeple(`Meep-${this.index}:${col}${ext}`, this)
    meep.paint(this.color);
    const row = (nrows - 1 - rank);
    const hex = hexMap.getHex({ row, col: col - 1 });
    if (hex.card) hex.card.addMeep(meep);
    return meep;
  }

  scoreCounter!: NumCounter;
  override get score() { return this.scoreCounter?.getValue(); }
  override set score(v: number) { this.scoreCounter?.updateValue(v); }

  setupCounters() {
    // display coin counter:
    const { high, wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .5;
    const ic = this.score;
    const cc = this.scoreCounter = new NumCounterBox('score', ic, C.WHITE, fs);
    cc.x = wide - 1 * gap; cc.y = high - (cc.high / 2 + 2 * gap);
    cc.boxAlign('right');
    this.panel.addChild(cc);

    // template for making add'tl counters:
    const c2 = this.counter1 = new NumCounterBox('net', 0, C.BLACK, fs)
    c2.x = cc.x - (c2.wide + gap); c2.y = high - (cc.high / 2 + 2 * gap);
    c2.boxAlign('right');
    this.panel.addChild(c2);
    c2.color;

    const c1 = this.counter0 = new NumCounterBox('net', 0, C.BLACK, fs)
    c1.x = c2.x - (c1.wide + gap); c1.y = high - (cc.high / 2 + 2 * gap);
    c1.boxAlign('right');
    this.panel.addChild(c1);

    cc.setValue(0, C.BLACK)
    c1.setValue(0)
    c2.setValue(0)
  }
  counter0!: NumCounter;
  counter1!: NumCounter;
  /** advance a counter, then invoke callback */
  advanceCounter(score: number, cb: () => void) {
    // TODO: GUI to click-select the counter to move
    const ndx = this.counter0.value < this.counter1.value ? 0 : 1;
    const ctr = [this.counter0, this.counter1][ndx];
    ctr.incValue(score);
    const scoreTrack = this.gamePlay.table.scoreTrack;
    const markers = scoreTrack.markers[this.index];
    markers[ndx].setValue(score, ndx)
    const faction = scoreTrack.factions[ndx][score];
    const color = ColCard.factionColors[faction];
    ctr.box.paint(color);
    cb();
  }

  /** choose and return one of the indicated meeples */
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void) {
    // TODO: GUI: set dropFunc -> colMeep(meep)
    const meep = meeps.sort((a, b) => a.card.rank - b.card.rank)[0];
    colMeep(meep)
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
  bumpMeeple(meep: ColMeeple, dir0: HexDir | undefined, cb: () => void) {
    const dir = dir0 ?? 'N';
    const card = (meep.card.hex.nextHex(dir) as OrthoHex2)?.card;// should NOT bump from black, but...
    card?.addMeep(meep);
    card?.stage?.update();
    // cb();
    return;
  }
}
