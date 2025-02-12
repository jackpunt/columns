import { C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { UtilButton } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, Player as PlayerLib, type HexDir, type HexMap, type NumCounter, type PlayerPanel } from "@thegraid/hexlib";
import { ColCard, nFacs } from "./col-card";
import { CardButton, CB, CoinBidButton, ColMeeple, ColSelButton } from "./col-meeple";
import { arrayN, GamePlay } from "./game-play";
import { OrthoHex, type HexMap2, type OrthoHex2 } from "./ortho-hex";
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
  selectCol(cb: () => void): void; // for xtraCol
  collectBid(): void;
  isDoneSelecting(): ColSelButton | undefined; // { colNum: number } | undefined
  bidOnCol(col: number): PlyrBid | undefined;
  cancelBid(col: number, bid: number): void;
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void): void;
  bumpMeeple(meep: ColMeeple, dir0?: HexDir, cb?: () => void): void;
  commitCards(): void;
}

export type PlayerColor = string;
export class Player extends PlayerLib implements IPlayer {
  static initialCoins = 400;
  // set our multi-player colors; we don't use the TP.colorScheme
  static {
    PlayerLib.colorScheme = {
      brown: '#663300',
      pink: '#FF33CC',
      orange: '#FF9900',
      green: '#66CC00',
      grey: '#5c5c5c',
      yellow: 'yellow',
      tan: 'tan',
      purple: '#ab47bc',
      blue: 'lightblue',
      white: 'white'
    }
  }

  declare static allPlayers: Player[];

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
    const ymax = this.makeCardButtons(TP.mHexes);  // number of columns
    this.setupCounters(ymax);
    this.makeAutoButton();
  }

  makeCardButtons(ncol = 4, ncoin = 4) {
    const opts = { visible: true, bgColor: this.color, player: this }
    const { width, height } = new ColSelButton(0, opts).getBounds(); // temp Button to getBounds()
    const { wide, gap } = this.panel.metrics, gap2 = gap / 2, dx = width + gap;
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
    const ymax = 2 * dy; // bottom edge of last row of buttons
    return ymax;
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

  /** choose column for xtraMeeple */
  xtraCol(ncols = 4) {
    return 1 + Random.random(ncols)
  }

  selectCol(cb: () => void) {
    const col = this.xtraCol(this.gamePlay.nCols)
    this.clearButtons();
    this.colSelButtons[col - 1].select()
    this.coinBidButtons[0].select(); // bid 1 to complete selection
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

  outBid(col: number, bid: number) {
    this.colSelButtons[col - 1].setState(CB.outbid);
    this.coinBidButtons[bid - 1].setState(CB.outbid);
  }

  collectBid() {
    // if not useRobo, nothing to do.

  }

  // ColMeeple is Tile with (isMeep==true); use MeepleShape as baseShape
  /**
   * make ColMeeple, add to ColCard @ {column, rank}
   * @param hexMap
   * @param column column
   * @param rank [0]
   * @param ext [''] mark name of xtraCol meeple
   */
  makeMeeple(hexMap: HexMap2, column: number, rank = 0, ext = '') {
    const meep = new ColMeeple(`Meep-${this.index}:${column}${ext}`, this)
    meep.paint(this.color);
    const card = hexMap.getCard(rank, column);
    card.addMeep(meep); // makeMeeple
    this.gamePlay.table.makeDragable(meep);
    return meep;
  }

  scoreCounter!: NumCounter;
  override get score() { return this.scoreCounter?.value; }
  override set score(v: number) { this.scoreCounter?.updateValue(v); }

  // build counters for each faction influence (bidCards & scoreTrack)
  makeCounter(xy: { x?: number, y: number }, color: string, fs: number) {
    const { high, wide, gap } = this.panel.metrics;
    const c1 = new NumCounterBox(`ctr${color}`, 0, C.BLACK, fs);
    c1.x = xy.x ?? (wide - gap);
    c1.y = xy.y;
    c1.boxAlign('right');
    this.panel.addChild(c1);
    c1.setValue(0, color);
    return c1
  }
  setupCounters(ymax: number) {
    // display coin counter:
    const fs = TP.hexRad * .45, { gap, high: phigh } = this.panel.metrics, ngt4 = TP.numPlayers > 4;
    const { high, wide } = this.scoreCounter = this.makeCounter({ y: (phigh + ymax) / 2 }, C.black, fs)
    const leftOf = (pc: XY) => ({ x: pc.x - wide - gap, y: pc.y });
    this.scoreCounters[0] = this.makeCounter(leftOf(this.scoreCounter), C.black, fs)
    this.scoreCounters[1] = this.makeCounter(leftOf(this.scoreCounters[0]) , C.black, fs)
    const { x, y } = this.scoreCounters[1], dx = wide + gap, dy = (high + gap) / 2
    const qloc = [
      [-dx * 2, +dy],
      [-dx * 3, +dy],
      [-dx * 2, -dy],
      [-dx * 3, -dy],
      [-dx * 4, 0],
    ];
    let pc: XY = { x: x - wide * 2, y }
    this.factionCounters = ColCard.factionColors.slice(0, 5).reverse().map((color, ndx) => {
      if (ngt4) {
        return pc = this.makeCounter(leftOf(pc), color, fs)
      } else { // purple, blue, gold, red, black
        const [qx, qy] = qloc[ndx];
        pc.x = x + qx; pc.y = y + qy;
        return this.makeCounter(pc, color, fs)
      }
    }).reverse()
  }
  scoreCounters: NumCounter[] = []
  autoScore = true;

  factionCounters: NumCounter[] = [];
  /** advance one score marker, then invoke callback [to gamePlay] */
  advanceMarker(dScore: number, cb: () => void) {
    if (!dScore) { setTimeout(cb, 0); return } // zero or undefined
    // this.gamePlay.gameState.doneButton(`Advance Marker ${score}`, this.color)
    const scoreTrack = this.gamePlay.table.scoreTrack;
    const markers = scoreTrack.markers[this.index];
    markers.forEach((m, index) => {
      const ctr = this.scoreCounters[index]; // counter for each marker
      const clickDone = (ds: number) => {
        const color = ColCard.factionColors[m.faction];
        ctr.setValue(m.value, color)
        this.score += ds; // may max out at end of track
        cb();
      }
      // click ScoreTrack.markers to choose which to advance:
      m.showDeltas(dScore, clickDone)
    })
    this.panel.stage?.update();
    if (this.autoScore) {
      this.autoAdvanceMarker(dScore)
    }
  }
  autoAdvanceMarker(dScore: number) {
    this.gamePlay.isPhase('BumpAndCascade')// 'EndRound' --> Score for Rank
    const { row, rowScores } = this.gamePlay.gameState.state;
    const scoreTrack = this.gamePlay.table.scoreTrack;
    const [m0, m1] = scoreTrack.markers[this.index];
    const allClkrs = [m0.clicker1, m0.clicker2, m1.clicker1, m1.clicker2]
    const valid = allClkrs.filter(clkr => clkr.parent)
    valid.sort((a, b) => a.value - b.value); // ascending
    const clicker = valid[0]; // least value
    clicker.onClick()
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
   * @param dir0 the direction for this bump (undefined for initial/winningBidder)
   * @param cb callback when bump cascade is done
   * @returns
   */
  bumpMeeple(meep: ColMeeple, dir0: HexDir | undefined, cb: () => void) {
    const dir = dir0 ?? 'N';
    const card = (meep.card.hex.nextHex(dir) as OrthoHex2).card;// should NOT bump from black, but...
    if (!card) return;
    const open = card.openCells
    card.addMeep(meep, open?.[0]); // bump to an openCell
    card.stage?.update();
    // cb();
    return;
  }

  /** put faction count into panel.factionCounters */
  countFactions() {
    this.factionCounters.forEach(fc => fc.setValue(0))
    this.meeples.forEach(meep => {
      this.factionCounters[meep.faction as number].incValue(1); // ASSERT: faction is defined
    })
    this.panel.stage.update();
  }
}

export class PlayerB extends Player {
  // map col [1..n]
  cardsInCol(col: number) {
    const nrows = this.gamePlay.nRows, hexMap = this.gamePlay.hexMap;
    return arrayN(nrows).map(row => hexMap.getCard(row, col))
  }

  dualsInCol(col: number) {
    const cards = this.cardsInCol(col).filter(card => card.factions[0] !== 0)
    return cards.filter(card => card.factions.length > 1)
  }
  factionsInCol(col: number) {
    // non-black cards in col
    const cards = this.cardsInCol(col).filter(card => card.factions[0] !== 0)
    return cards.map(card => card.factions).flat(1)
  }
  colScore() {
    const hexMap = this.gamePlay.hexMap
    const { nRows, nCols } = this.gamePlay, nCards = nRows * nCols;
    const nfacs = arrayN(1 + nFacs, i => 0); // count of each faction on board
    hexMap.forEachHex(hex => hex.card.factions.forEach(f => nfacs[f]++));
    const colScore = arrayN(1 + nCols, i => 0);
    arrayN(nCols, 1).map(col => {
      this.cardsInCol(col).filter(c => c.factions[0] !== 0).map(card => {
        const facs = card.factions, n = facs.length;
        facs.forEach(f => colScore[col] += nfacs[f] / n);
      })
    })
    return colScore.map((score, col) => ({ col, score })).slice(1);
  }
  override xtraCol() {
    const nCols = this.gamePlay.nCols
    const colScore = this.colScore()
    colScore.sort((a,b) => b.score - a.score)
    const weights = [0], nof = colScore.map((cs, cr) => (nCols - cr) * nCols + 1 + (nCols - cs.col))
    colScore.forEach((cs, cr) => weights.splice(0, 0, ...arrayN(nof[cr], j => cr)))
    const nw = weights.length;
    permute(weights)
    const rand = Random.random(nw)
    const ndx = weights[rand]
    const col = colScore[ndx].col;
    return col
  }

  override selectCol(cb: () => void) {
    const col = this.xtraCol()
    this.clearButtons();
    this.colSelButtons[col - 1].select()
    this.coinBidButtons[0].select(); // bid 1 to complete selection
    cb();
  }
  // factionCounters are ordered by factionColors: [B,r,g,b,v]
  override autoAdvanceMarker(dScore: number) {
    const scoreTrack = this.gamePlay.table.scoreTrack, max = scoreTrack.maxValue;
    const mkrs = scoreTrack.markers[this.index].filter(m => m.value < max);
    const allClkrs0 = mkrs.map(m => [m.clicker1, m.clicker2]).flat(1);
    const allClkrs = allClkrs0.filter(clkr => clkr.parent); // shown an GUI...

    const cards = this.coinBidButtons.filter(b => (b.state === CB.clear)) // yet to be played
    const factionTotals = ColCard.factionColors.slice(0, 5).map((color, faction) => 0
      + this.factionCounters[faction].value
      + allClkrs.filter(clk => clk.faction == faction).length
      + cards.filter(card => card.factions.includes(faction)).length / 2
    )
    factionTotals[0] = 0; // downgrade Black

    this.gamePlay.isPhase('BumpAndCascade')// 'EndRound' --> Score for Rank
    const { row, rowScores } = this.gamePlay.gameState.state;
    allClkrs.sort((a, b) => a.value - b.value); // ascending
    allClkrs.sort((a, b) => factionTotals[b.faction] - factionTotals[a.faction]); // descending
    const maxes = allClkrs.filter(clk => clk.value == max)
    const clicker = (maxes.length > 0)
    ? maxes.sort((a, b) => a.value - b.value)[0] // lowest able to hit max
    : allClkrs[0];     // lowest of the most present faction
    if (!clicker) debugger;
    clicker.onClick()
  }
}
