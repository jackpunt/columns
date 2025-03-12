import { AT, C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { afterUpdate, UtilButton, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, GamePlay as GamePlayLib, Player as PlayerLib, type HexMap, type NumCounter, type PlayerPanel, type SetupElt as SetupEltLib, Tile, NC, type DragContext, type IHex2 } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { CardButton, CB, ColBidButton, ColSelButton, type CardButtonState } from "./card-button";
import { ColMeeple } from "./col-meeple";
import type { ColTable, MarkerShape } from "./col-table";
import { arrayN, GamePlay, nFacs, type BumpDir, type Faction } from "./game-play";
import { PlayerGameSetup } from "./game-setup";
import { TP } from "./table-params";

type PlyrBid = { plyr: Player; bid: number; }
/** interface from GamePlay/GameState to Player */
export interface IPlayer {
  makeMeeple(colId: number | string, ext?: string): ColMeeple;
  panel: PlayerPanel;
  score: number;
  color: string;
  meeples: ColMeeple[];
  colBidButtons: ColBidButton[]; // { state?: string, factions: number[] }
  clearButtons(): void; // reset CardButton: setState(CB.clear)
  selectCol(): void; // for xtraCol
  collectBid(): void;
  isDoneSelecting(): ColSelButton | undefined; // { colNum: number } | undefined
  bidOnCol(col: number): PlyrBid | undefined;
  cancelBid(col: number, bid: number): void;
  meepleToAdvance(meeps: ColMeeple[], colMeep: (meep?: ColMeeple) => void): void;
  chooseBumpee_Ndx(meep: ColMeeple, other: ColMeeple, bumpDir: 'S' | 'N'): [ColMeeple, ndx: number]
  doneifyCards(): void;
}

export class Player extends PlayerLib implements IPlayer {
  static initialCoins = 400;
  // set our multi-player colors; we don't use the TP.colorScheme
  // PlayerLib.playerColor(cname|ndx) --> colorScheme[cname]
  static {
    PlayerLib.colorScheme = {
      brown: '#784600', // #663300
      pink: '#FF33CC',  // #FF33CC
      orange: '#FF9900',// #FF9900
      green: '#66CC00', // #66CC00
      grey: '#5c5c5c',  // #5c5c5c
      yellow: 'yellow',
      tan: 'tan',
      purple: '#ab47bc',// #ab47bc
      blue: 'lightblue',
      white: 'white',
    }
  }

  override get meeples() { return super.meeples as ColMeeple[]; }

  declare gamePlay: GamePlay;

  table: ColTable;
  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
    this.table = gamePlay.table; // for stime.anno
  }

  /** Sum of this player's scoreForRow */
  get rankScoreNow() {
    const scores = this.gamePlay.scoreForRank(); // all players, each row;
    const myScores = scores.map(s4row => s4row.filter(ps => ps.plyr == this).map(ps => ps.score)).flat()
    return Math.sum(...myScores)
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
  }

  // 2 score counters (advancing on track)
  // [AvailGreen, ChoosenYellow, UsedRed-disabled]
  // 4 ColBid cards (shrink to buttons, disable when played)
  // nc ColSelect cards (shrink to buttons)
  //
  override makePlayerBits(): void {
    // super.makePlayerBits()
    if (this.index >= 6) {
      this.gamePlay.table.dragger.makeDragable(this.panel)
    }
    const ymax = this.makeCardButtons(this.gamePlay.nCols);  // number of columns
    this.setupCounters(ymax);
    const manuBut = this.manuButton = this.makeAutoButton(2, 'M', { bgColor: 'lime', active: false }); // manual done
    manuBut.on(S.click, () => this.manualDone(), this); // toggle useRobo
    const autoBut = this.autoButton = this.makeAutoButton(1, 'A');
    autoBut.on(S.click, () => this.setAutoPlay(), this); // toggle useRobo
    const redoBut = this.redoButton = this.makeAutoButton(0, 'R');
    redoBut.on(S.click, () => this.selectBid(), this); // select alt bid
  }

  makeCardButtons(nCols = 4, nbid = 4) {
    const opts = { visible: true, bgColor: this.color, player: this }
    const { width, height } = new ColSelButton(0, opts).getBounds(); // temp Button to getBounds()
    const { wide, gap } = this.panel.metrics, gap2 = gap / 2, dx = width + gap;
    const dy = height + gap, panel = this.panel;
    const makeButton = function<T extends CardButton> (claz: Constructor<T>, num: number) {
      return arrayN(num).map(ndx => {
        const button = new claz(ndx + 1, opts)
        return button
      })
    }
    const placeButtons = function (buttons: CardButton[], row = 0) {
      const num = buttons.length;
      const x0 = (width / 2) + (wide - (num * dx - gap2)) / 2;
      const y0 = (height / 2) + gap;
      buttons.forEach((button, ndx) => {
        button.x = x0 + dx * ndx;
        button.y = y0 + dy * row;
        panel.addChild(button);
      })
    }
    const ncol = TP.usePyrTopo ? Math.max(nCols, 5) : nCols;
    this.colSelButtons = makeButton(ColSelButton, ncol);
    this.colBidButtons = makeButton(ColBidButton, nbid);
    if (TP.usePyrTopo && this.gamePlay.allPlayers.length < 5) this.colSelButtons.splice(2, 1);
    placeButtons(this.colSelButtons, 0);
    placeButtons(this.colBidButtons, 1);
    const ymax = 2 * dy; // bottom edge of last row of buttons
    return ymax;
  }
  makeAutoButton(n = 1, label = 'A', opts: UtilButtonOptions & TextInRectOptions = {}) {
    const { high } = this.panel.metrics, fs = TP.hexRad / 2;
    const autoBut = new UtilButton(label, { active: true, border: .1, fontSize: fs, ...opts })
    autoBut.dy1 = -.1; autoBut.setBounds(undefined, 0, 0, 0);
    autoBut.paint(undefined, true);
    // if (autoBut.cacheID) { autoBut.updateCache() } else { autoBut.setCacheID() }
    autoBut.x = (fs * .5) + 0 * fs; autoBut.y = (high - fs * .55) - n * fs * 1.2;
    this.panel.addChild(autoBut)
    return autoBut
  }
  manuButton!: UtilButton;
  autoButton!: UtilButton;
  redoButton!: UtilButton;

  /** true: player auto-selects play; false: player uses GUI  */
  setAutoPlay(v = !this.useRobo) {
    this.useRobo = v;
    this.autoButton.paint(this.useRobo ? '#c5e1a5' : C.WHITE)
    this.autoButton.stage?.update();
  }

  // pro-forma so PlayerB can override
  selectBid() { }
  colSelButtons!: ColSelButton[];
  colBidButtons!: ColBidButton[];

  /** at start of round */
  clearButtons() {
    this.colSelButtons.forEach(b => (b.setState(CB.clear)))
    this.colBidButtons.forEach(b => (b.setState(CB.clear), b.bidOnCol = undefined))
  }

  /** used to select xtraCol  [{ sndx: 0, score}, {sndx: 1, score, ... }] */
  xtraColScore() {
    const hexMap = this.gamePlay.hexMap
    const nfacs = arrayN(1 + nFacs, i => 0); // count of each faction on board
    hexMap.forEachHex(hex => hex.card.factions.forEach(f => nfacs[f]++));

    const blackN = this.gamePlay.blackN;     // blackN[2] may be BlackNull
    const colIds = blackN.map(card => card.col);
    // initialize scores to zero:
    // colIds.reduce((pv, cv) => (pv[cv] = 0, pv), {} as Record<string, number>)
    const colScores = arrayN(blackN.length).map(bndx => ({ bndx, score: 0 }));
    blackN.map(card => card.col).map((col, bndx) => {
      this.gamePlay.cardsInCol(col).map(card => {
        const facs = card.factions, n = facs.length;
        facs.forEach(f => colScores[bndx].score += nfacs[f] / n);
      })
    })
    if (blackN[2].maxCells == 0) colScores[2].score = 0; // col C not being used
    const rv0 = colScores.map(({ bndx, score }) => ({ sndx: this.colSelButtons.findIndex(b => b.colId == blackN[bndx].colId), score}));
    const rv = rv0.filter(elt => elt.sndx >= 0)
    if (rv.find(elt => (elt.sndx < 0))) { debugger }
    return rv
  }
  /** choose column for xtraMeeple */
  xtraCol() {
    const nCols = this.gamePlay.nCols
    const colScore = this.xtraColScore()
    colScore.sort((a,b) => b.score - a.score)
    const weights = [0], nof = colScore.map((cs, cr) => (nCols - cr) * nCols + 1 + (nCols - cs.sndx))
    colScore.forEach((cs, cr) => weights.splice(0, 0, ...arrayN(nof[cr], j => cr)))
    const nw = weights.length;
    // {colScore} nw={nw} [{rand}->{ndx}] = {colScore[ndx].col} {nof}
    permute(weights)
    const rand = Random.random(nw)
    const ndx = weights[rand]
    const sel = colScore[ndx].sndx;
    if (sel > nCols) debugger;
    return sel // ndx of colSelButtons
  }

  /** for xtraCol; card.select() -> cardDone = card */
  selectCol() {
    const sel = this.xtraCol()
    this.clearButtons();
    console.log(stime(this, `.selectCol: ${this.Aname} -> ${sel} of ${this.gamePlay.nCols}`));
    this.colSelButtons[sel].select()
    this.colBidButtons[0].select(); // bid 1 to complete selection
  }

  /** during CollectBids (& chooseXtra) */
  isDoneSelecting() {
    return (
      this.colBidButtons.find(cb => cb.state === CB.selected) &&
      this.colSelButtons.find(cb => cb.state === CB.selected)
      )
  }
  /**
   * inPhase(ResolveWinner): If this Player bid on the indicated col, return the bid
   * @param col column [1..nCols], index = col - 1
   * @returns \{ plyr: this, bid: number }
   */
  bidOnCol(col: number) {
    return this.colSelButtons[col - 1]?.state === CB.selected ? { plyr: this, bid: this.currentBid } : undefined
  }
  /** value of the current CB.selected ColBidButton */
  get currentBid() { return this.curBidCard.colBid; }
  /** The current CB.selected ColBidButton */
  get curBidCard() {
    return this.colBidButtons.find(b => (b.state === CB.selected)) as ColBidButton;
  }

  /** End of turn: mark Sel & Bid cards from CB.selected to CB.done */
  doneifyCards() {
    const csb = this.colSelButtons.find(b => b.state === CB.selected);
    const cbb = this.colBidButtons.find(b => b.state === CB.selected);
    if (csb) { csb.setState(CB.done); };
    if (cbb) { cbb.setState(CB.done); cbb.bidOnCol = csb!?.colNum };
  }

  cancelBid(col: number, bid: number) {
    this.colSelButtons[col - 1].setState(CB.cancel);
    this.colBidButtons[bid - 1].setState(CB.cancel);
  }

  outBid(col: number, bid: number) {
    this.colSelButtons[col - 1].setState(CB.outbid);
    this.colBidButtons[bid - 1].setState(CB.outbid);
  }

  /** invoke gameState.cardDone = card when selecting */
  collectBid() {
    if (!this.useRobo) return; // nothing to do; GUI will set cardDone via onClick()

  }


  saveCardStates() {
    const sels = this.colSelButtons.map(b => b.state as CardButtonState);
    const bids = this.colBidButtons.map(b => b.state as CardButtonState);
    return { sels, bids }
  }

  parseCardStates(pStates: ReturnType<Player['saveCardStates']>) {
    const { sels, bids } = pStates
    sels.forEach((b, ndx) => this.colSelButtons[ndx].setState(b, false))
    bids.forEach((b, ndx) => this.colBidButtons[ndx].setState(b, false))
    return
  }
  // ColMeeple is Tile with (isMeep==true); use MeepleShape as baseShape
  /**
   * make ColMeeple, add to ColCard @ {column, rank}
   * @param hexMap
   * @param colId colNum | `${player.index}:${colNum}`
   */
  makeMeeple(colId: number | string, ext = '') {
    Tile.gamePlay = this.gamePlay; // so Meeples can find their GamePlay
    const cid = (typeof colId == 'number')
      ? `${ColSelButton.colNames[colId]}${ext}`
      : colId;
    const meep = new ColMeeple(cid, this)
    meep.paint(this.color);
    this.gamePlay.table.makeDragable(meep);
    return meep;
  }

  factionCounters: NumCounter[] = [];
  autoScore = true;
  scoreCounters: NumCounter[] = []
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

  /**
   * current support (meeps, markers, cards-inPlay) from each faction: [B, r, g, b, v]
   */
  factionTotals(markers = this.markers, inPlay = true) {
    const cards = this.colBidButtons.filter(b => b.inPlay(inPlay)) // false --> yet to play
    const nFacs = ColCard.factionColors.length - 1; // exclude white faction
    const factionTotals = (arrayN(nFacs) as Faction[]).map(faction => 0
      + this.meepFactions[faction]
      + markers.reduce((pv, mrk) => pv + (mrk.faction == faction ? 1 : 0), 0)
      + cards.reduce((pv, card) => pv + (card.factions.includes(faction) ? .5 : 0), 0)
    )
    return factionTotals
  }

  /** MarkerShapes on ScoreTrack */
  get markers() {
    const scoreTrack = this.gamePlay.table.scoreTrack, max = scoreTrack.maxValue;
    const markers = scoreTrack.markers[this.index].filter(m => m.value <= max);
    return markers;
  }

  /**
   * update scoreCounters[i] and total score.
   * @param i marker.origIndex
   * @param value new value of marker[i] -> counter[i]
   * @param faction marker.faction
   */
  scoreCount(marker: MarkerShape) {
    const color = ColCard.factionColors[marker.faction];
    this.scoreCounters[marker.index].setValue(marker.value, color);
    this.score = Math.sum(...this.scoreCounters.map(ctr => ctr.value))
  }

  /** advance one score marker, then invoke callback [to gamePlay] */
  advanceMarker(dScore: number, rowScores: ReturnType<GamePlay["scoreForRank"]> = [], cb?: () => void) {
    if (!dScore) { cb && setTimeout(cb, 0); return } // zero or undefined
    // this.gamePlay.gameState.doneButton(`Advance Marker ${score}`, this.color)
    const scoreTrack = this.gamePlay.table.scoreTrack;
    const markers = scoreTrack.markers[this.index];
    markers.forEach(m => {
      const clickDone = () => {
        this.scoreCount(m)
        cb && cb();
      }
      // click ScoreTrack.markers to choose which to advance:
      m.showDeltas(dScore, clickDone) // pick a marker, setValue(ds,tr), storeCount()
    })
    this.panel.stage?.update();
    if (this.autoScore) {
      this.autoAdvanceMarker(dScore, rowScores); // auto-click one of the markers
    }
  }

  /**
   * clickers are already on (marker.value + dScore); pick one.
   * @param dScore score points earned; advance one marker by dScore
   * @param rowScores [empty when doing scoreForColor]
   */
  autoAdvanceMarker(dScore: number, rowScores: ReturnType<GamePlay["scoreForRank"]>) {
    this.gamePlay.isPhase('AdvanceAndBump')// 'EndRound' --> Score for Rank
    const rMax = this.gamePlay.nRows - 1; // max Rank
    const scoreTrack = this.gamePlay.table.scoreTrack, max = scoreTrack.maxValue;
    const allClkrs0 = this.markers.filter(m => m.value < max).map(m => [m.clicker1, m.clicker2]).flat(1);
    const allClkrs = allClkrs0.filter(clkr => clkr.parent); // shown an GUI...
    allClkrs.sort((a, b) => a.value - b.value); // ascending
    // TODO: sort by fac-bids available & cells hit-able; esp when tOR==2
    // intersect colSel(clear) with bumpStop.map(cell.fac)

    // avoid Black (unless able to land on rMax w/4-bid)
    const colSels = this.colSelButtons.filter(b => b.state == CB.clear)
    const rMaxes = this.meeples.filter(m => m.card.rank == rMax)
    const useBlack = (rMaxes.length > 0  // meeples on rMax
      && this.colBidButtons[3].state == CB.clear  // 4-bid is clear
      && rMaxes.filter(m => colSels.find(b => b.colNum == m.card.col)).length > 0
    )
    const factionTotals = this.factionTotals(allClkrs, false); // yet to play
    if (!useBlack) factionTotals[0] = 0;
    allClkrs.sort((a, b) => factionTotals[b.faction] - factionTotals[a.faction]); // descending

    // cross the finish line:
    const maxes = allClkrs.filter(clk => clk.value == max);
    const clicker = (maxes.length > 0)
      ? maxes.sort((a, b) => a.value - b.value)[0] // lowest mrkr that reaches max value
      : allClkrs[0];     // lowest mrkr of the most present faction
    if (!clicker) debugger; // Player maxed out
    clicker?.onClick();    // {clicker.marker.value} -> {clicker.value}
  }
  manualDoneFunc!: () => void;
  manualDone() {
    this.manuButton.activate(false); // vis = false
    this.manualDoneFunc()
  }
  adviseMeepleDrop(meep: ColMeeple, targetHex: IHex2, ctx: DragContext, xy: XY) {
    if (!this.useRobo
      && ctx.gameState.isPhase('ResolveWinner')
      && this.colMeep
      && this.meepsToAdvance.includes(meep)
    ) {
      // un-nudge the meeple and select meepleToAdvance
      meep.fromHex.card.addMeep(meep); // put it back
      const colMeep = this.colMeep;    // meeple to advance has stashed colMeep
      this.colMeep = undefined; // one-shot
      this.meepsToAdvance.forEach(m => m.highlight(false, false));
      afterUpdate(meep, () => colMeep(meep), this, 10);
      return true;  // tell dragFunc we have handled it
    }
    return false;   // not our problem
  }
  colMeep?: (meep: ColMeeple) => void;
  meepsToAdvance!: ColMeeple[]

  /** sort meeps; choose and return one of the indicated meeples */
  meepleToAdvance(meeps: ColMeeple[], colMeep?: (meep?: ColMeeple) => void) {
    // TODO: GUI: set dropFunc -> colMeep(meep); so each player does their own D&D
    if (!this.useRobo && colMeep) {   // subGame will have no colMeep & expects full-auto?
      meeps.forEach(m => m.highlight(true, true)); // light them up!
      this.meepsToAdvance = meeps;
      this.colMeep = colMeep;
      return;
    }
    meeps.sort((a, b) => a.card.rank - b.card.rank);
    const meep = this.meepToAdvanceAuto(meeps); // overrideable decision
    if (colMeep) colMeep(meep)
    return meep;
  }
  /** meeps is already sorted by increasing rank */
  meepToAdvanceAuto(meeps: ColMeeple[]) {
    return meeps[0];
  }

  bestFacs(card: ColCard) {
    const factionTotals = this.factionTotals(); // scoreMarkers & bids.inPlay
    const bestFacs = card.factions.slice().sort((a, b) => factionTotals[b] - factionTotals[a]); // descending
    return [bestFacs, factionTotals] as [Faction[], number[]];
  }

  readonly bumpDirs = ['SS', 'S', 'N'] as BumpDir[]; // pro-forma default
  /** meep will Advance (dir=1) to card, select a cellNdx; also bumpDir for any bumps */
  selectNdx_BumpDir(meep: ColMeeple, card: ColCard, dirs = this.bumpDirs, ndxs = [0]) {
    if (!this.useRobo) {
      // TODO use adviseDropMeeple
    }
    // remove meep, score:
    const { ndx, bumpDir } = dirs.map(dir => this.bestBumpInDir(meep, card, dir, ndxs)).sort((a, b) => b.score - a.score)[0]
    return { ndx, bumpDir }
  }
  /** put meep on card, optimize cell and meepToBump */
  bestBumpInDir(meep: ColMeeple, card: ColCard, bumpDir: BumpDir, ndxs = [0]) {
    // TODO: search tree of {dir, ndx} over cascades (if any)
    const [bndx, score] = this.bestNdxForMe(card, bumpDir), ndx = bndx ?? ndxs[0];
    return { ndx, bumpDir, meep, score }
  }

  /** ndx of cell that maximizes payoff from advance */
  bestNdxForMe(card: ColCard, bumpDir: BumpDir) {
    const [bestFacs, factionTotals] = this.bestFacs(card)
    const bidFacs = this.curBidCard!?.factions;
    const fac = bestFacs.find(fac => bidFacs.includes(fac));
    // TODO: hit self when bumpdir == 1 && can hit bid color: hit self
    const mMeep = (bumpDir == 'N') ? card.meepsOnCard.find(m => m?.player == this) : undefined;
    const mNdx = mMeep?.cellNdx, mBid =  (mNdx !== undefined) && bidFacs.includes(card.factions[mNdx])
    const ndx = mMeep && mBid ? mNdx : (fac !== undefined) ? card.factions.indexOf(fac) : undefined;
    const val = (fac !== undefined) ? factionTotals[fac] : 0;
    return [ndx, val] as [ndx: number | undefined, val: number]
  }

  /**
   * From advance or bump, meep and other are in same cell, one of them must be bumped.
   *
   * choose bumpee = [meep or other];
   * choose cellNdx for the bumpee
   */
  chooseBumpee_Ndx(meep: ColMeeple, other: ColMeeple, bumpDir: 'S' | 'N'): [ColMeeple, ndx: number] {
    const card0 = meep.card;
    const card2 = card0.nextCard(bumpDir)
    // if other is mine && isOk then bump other (even if, esp if bumpDir == 1)
    if (other.player == this) {
      const [ndx, val] = this.bestNdxForMe(card0, bumpDir), isOk = (ndx !== undefined);
      // meep.card is good/ok to land, secure that landing and bump our co-agent;
      if (isOk) {
        return this.chooseCellForBumpee(other, bumpDir, card2)
      }
    }
    if (bumpDir.startsWith('S')) return this.chooseCellForBumpee(other, bumpDir, card2)
    if (card2.hex.row === 0) return [other, 0];
    const bumpee = (meep.card.rank == 4) ? other : meep;
    return this.chooseCellForBumpee(bumpee, bumpDir, card2)
  }

  /** bumpee is being bumped in dir to card: choose cellNdx */
  chooseCellForBumpee(bumpee: ColMeeple, bumpDir: BumpDir, card: ColCard): [ColMeeple, ndx: number] {
    // TODO:
    // if bumpDir == 1
    // bumpee is ours: hit own-meep so we can re-bump, or bestBid so we can stay;
    // bumpee not ours: hit black or empty to limit cascade
    // else bumpDir == -1 | -2
    // bumpee is ours: try hit bestFacs, else hit something to rebump
    // bumpee not ours: hit something so others re-bump [or not if we are lower in chain]

    // to Black card, it does not matter
    if (card.factions[0] == 0) return [bumpee, 0];
    const nCells = card.factions.length, rand = Random.random(nCells);
    const card2 = card.nextCard(bumpDir), c2isBlk = card2.factions[0] == 0;
    const meepAtNdx = card.meepsAtNdx; // entry for each cellNdx;
    if (bumpDir == 'N') {
      if (bumpee.player == this) {
        let ndx = c2isBlk
          ? meepAtNdx.findIndex(meep => meep?.player && (meep?.player !== this)) // try hit our meep
          : meepAtNdx.findIndex(meep => (meep?.player === this)) // try hit our meep
        if (ndx < 0) ndx = c2isBlk
          ? meepAtNdx.findIndex(meep => !meep) // take empty slot
          : meepAtNdx.findIndex(meep => !!meep) // hit any other meep
        if (ndx < 0) ndx = this.bestNdxForMe(card, bumpDir)[0] ?? rand;
        return [bumpee, ndx]
      } else {
        let ndx = meepAtNdx.findIndex(meep => !meep) // take empty slot
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => meep?.player == this) // try hit me
        if (ndx < 0) ndx = rand;
        return [bumpee, ndx]
      }
    } else {
      if (bumpee.player == this) {
        let ndx = this.bestNdxForMe(card, bumpDir)[0] ?? -1;
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => meep?.player && meep.player !== this) // try hit other
        if (ndx < 0) ndx = rand;
        return [bumpee, ndx];
      } else {
        // TODO: if I have a meeple lower down, prefer to hit empty cell?
        const meepAtNdx = card.meepsAtNdx; // entry for each cellNdx;
        let ndx = meepAtNdx.findIndex(meep => meep?.player && (meep.player !== this)); // first index with a meep
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => !!meep); // first index with a meep
        if (ndx < 0) ndx = rand;
        return [bumpee, ndx]
      }
    }
    return [bumpee, 0]
  }


  /** same or equivalent factions, both empty or both occupied */
  chooseCellToEnter(card: ColCard) {
    const factionTotals = this.factionTotals(); // scoreMarkers & bids.inPlay
    const bestFacs = card.factions.slice().sort((a, b) => factionTotals[b] - factionTotals[a]); // descending
    // if (meep !== gamePlay.winnerMeep) dubious to consider bidFac..
    const bidFacs = this.curBidCard?.factions ?? [];
    const bidFac = bestFacs.find(fac => bidFacs.includes(fac));
    const bf0 = bidFac ?? bestFacs[0], cardFacs = card.factions
    // if equal value take the left slot TODO: do better
    const ndx = arrayN(cardFacs.length).find(ndx => cardFacs[ndx] == bf0) ?? 0;
    if (card.openCells.length == 1 && ndx !== card.openCells[0]) debugger;
    return ndx
    // return cardFacs.includes(bf0) ? cardFacs.indexOf(bf0) : 0;
  }

  /** count of meeples on each Faction [B, r, g, b, v] */
  get meepFactions() {
    const counts = arrayN(1 + nFacs, i => 0); // B + 4
    this.meeples.forEach(meep => counts[meep.faction as number]++)// ASSERT: faction is defined
    return counts;
  }
  /** Put Meeple.faction count into panel.factionCounters */
  setFactionCounters() {
    const meepFactions = this.meepFactions;
    this.factionCounters.forEach((fc, i) => fc.setValue(meepFactions[i]))
    this.panel.stage.update();
  }
}

export class PlayerB extends Player {

  override newGame(gamePlay: GamePlay, url?: string): void {
    super.newGame; //(gamePlay, url)
    // setAutoPlay() for top-level GUI-enabled PlayerB:
    if (!!gamePlay.table.stage.canvas && this.index < TP.startAuto) {
      console.log(stime(this, `.newGame[${this.index}] setAutpPlay ${this.Aname}`))
      setTimeout(() => this.setAutoPlay(true), 10)
    }
  }

  autoAdvanceMarkerX(dScore: number, rowScores: ReturnType<GamePlay["scoreForRank"]>) {
    super.autoAdvanceMarker(dScore, rowScores)
  }

  override setAutoPlay(v = !this.useRobo): void {
    if (!v) {
      super.setAutoPlay(v);
      return;
    }
    if (!this.subGameSetup) this.makeSubGame();
    super.setAutoPlay(v);
    if (this.gamePlay.isPhase('CollectBids')) {
      setTimeout(() => this.collectBid(), 10);
    }
  }

  subGameSetup!: PlayerGameSetup;
  makeSubGame() {
    const gameSetup = this.gamePlay.gameSetup;
    const state0 = gameSetup.startupScenario;
    const scene0 = { start: state0 }
    // const stateInfo = this.gamePlay.scenarioParser.saveState();
    const qParams = gameSetup.qParams;
    const setupElt = { ...state0, n: TP.numPlayers };
    setupElt.Aname = `${this.Aname}-subGame`;
    // game with no canvas for Stage:
    const subGame = this.subGameSetup = new PlayerGameSetup(gameSetup, setupElt);
    // subGame.startup(stateInfo);
    return subGame
  }

  /** invoke gameState.cardDone = card when selecting */
  override collectBid() {
    if (!this.useRobo) return; // nothing to do; GUI will set cardDone via onClick()
    this.collectBid_simpleGreedy(); // this.gameState.cardDone = ccard & bcard
  }

  /** play all the cards, return list with each result */
  collectScores(subGamePlay: GamePlay) {
    const subPlyr = subGamePlay.allPlayers[this.index] as PlayerB;
    const colCards = this.colSelButtons.filter(c => c.state === CB.clear).map(c => subPlyr.colSelButtons[c.colNum - 1])
    const bidCards = this.colBidButtons.filter(b => b.state == CB.clear).map(b => subPlyr.colBidButtons[b.colBid - 1])
    const bidCard1 = subPlyr.colBidButtons[0]
    const scores2: any[] = []
    const scores = colCards.map(ccard =>
      bidCards.map(bcard => {
        // mark 'selected' for scoreForColor; no other players -> never gamePlay.allDone()
        ccard.setState(CB.selected, false);
        bcard.setState(CB.selected, false);
        let [score, scoreStr, meep] = this.pseudoWin(ccard, bcard); // advance in ccard.col
        if (subGamePlay.turnNumber > 0 && this.score < 2) {
          if (bcard.colBid == 4) { score = -99; }  // marker: include in scores0
        }
        const rv = { ccard, bcard, score, meep, scoreStr }
        if ([2, 3].includes(bcard.colBid)) { scores2.push(rv); }
        ccard.setState(CB.clear);
        bcard.setState(CB.clear);
        return rv
      })
    ).flat().concat(scores2)
    return scores;
  }
  latestScores!: ReturnType<PlayerB['collectScores']>

  // Score each choice (A1, A2, ..., D3, D4); sort, choose one of the best.
  // metric is immediate points scored (plus a bit for rank)
  collectBid_simpleGreedy() {
    // sync subGame with realGame
    this.subGameSetup.syncGame(); PlayerGameSetup
    const subGamePlay = this.subGameSetup.gamePlay; GamePlay;
    // console.log(stime(this, `.simpleGreedy - ${this.Aname} \n`), subGamePlay.mapString)
    // clear prior selections when restarting from saved state:
    this.colSelButtons.forEach(but => but.state == CB.selected && but.setState(CB.clear))
    this.colBidButtons.forEach(but => but.state == CB.selected && but.setState(CB.clear))
    const scores = this.latestScores = this.collectScores(subGamePlay)
    const [col, bid] = this.selectBid(scores)
    if (this.gamePlay.gameState.turnOfRound == 1 && bid == 1) {
      this.selectBid(scores); // try again
    }
  }
  // black in row-[0..1] only if no other bid will score.
  filterBlackBids(scores = this.latestScores) {
    const altBids = scores.filter(({ bcard, score }) => score == -99 || (bcard.colBid !== 4 && score > 0))
    return altBids.length > 0 ? altBids : scores;
  }

  override selectBid(scores = this.latestScores) {
    // deselect prevous bid
    this.colSelButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    this.colBidButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    // Sort and select { ccard, bcard } based on score:
    scores = this.filterBlackBids(scores);
    const scoress = scores.sort((a, b) => b.score - a.score);// descending
    const score0 = scoress[0].score
    const scores0 = scoress.filter(({score}) => (score == score0) || (score == -99)), slen= scores0.length;
    // copy the results:
    const scc = scores0.map(({ ccard, bcard, score, meep, scoreStr }) => [ccard.colId, bcard.colBid, score, meep, scoreStr])
    const sc5 = scoress.map(({ ccard, bcard, score, meep, scoreStr }) => [ccard.colId, bcard.colBid, score, meep, scoreStr])
    // if (scoress.length < 3) debugger;
    // choose a col/bid pair:
    const { ccard, bcard, score, meep, ndx } = (slen >= 1)
      ? this.uniformChoice(scores0)
      : this.fuzzyChoice(scoress);
    // translate to *this* player:
    const colCard = this.colSelButtons.find(b => b.colNum == ccard.colNum) as ColSelButton;
    const bidCard = this.colBidButtons.find(b => b.colBid == bcard.colBid) as ColBidButton;
    const plyrId = AT.ansiText(['red', 'bold'], this.Aname)
    const ndxStr = AT.ansiText([slen == 1 ? 'red' : 'blue', 'bold'], `${ndx}/${slen}`)
    console.log(stime(this, `.collectBid_greedy: ${plyrId} [${ndxStr}] ${colCard.colId}-${bidCard.colBid} => ${score0} meep=${meep}\n`), scc, sc5)
    colCard.select()
    bidCard.select()
    this.gamePlay.table.stage.update()
    return [colCard.colNum, bidCard.colBid]
  }

  uniformChoice(scores: ReturnType<PlayerB['collectScores']>) {
    const ndx = Random.random(scores.length);
    return { ...scores[ndx], ndx }
  }
  fuzzyChoice(scores: ReturnType<PlayerB['collectScores']>) {
    const ndxs = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3], len = ndxs.length;
    const ndx = permute(ndxs)[Random.random(len)]
    return { ...scores[ndx], ndx };
  }

  /** pretend ccard,bcard win, and advance on col */
  pseudoWin(ccard: ColSelButton, bcard: ColBidButton): [score: number, str: string, meepStr: string] {
    const gamePlay = this.subGameSetup.gamePlay ?? this.gamePlay;
    const plyr = gamePlay.allPlayers[this.index];
    const rankScore0 = plyr.rankScoreNow, perTurn = 1 / gamePlay.gameState.turnOfRound
    // save original locations:
    const col = ccard.colNum, cardsInCol = gamePlay.cardsInCol(col);
    const allMeepsInCol = cardsInCol.map(card => card.meepsOnCard).flat()
    const fromCardNdx = allMeepsInCol.map(meep => [meep, meep.card, meep.cellNdx] as [ColMeeple, ColCard, cellNdx: number])
    // player meepsInCol:
    const meepsInCol = gamePlay.meepsInCol(col, plyr);
    const meep = plyr.meepleToAdvance(meepsInCol)!; // choose lowest rank [TODO-each]
    gamePlay.gameState.winnerMeep = meep;
    const bumpDir = gamePlay.advanceMeeple(meep), meepStr = meep.toString();
    const [scorec, scoreStr] = gamePlay.scoreForColor(meep, undefined, false)
    const rankDiff = Math.round((plyr.rankScoreNow - rankScore0) * perTurn);
    const rd = Math.max(0, rankDiff); // TODO: per turnOfRound
    const score = scorec + rd;
    // restore meeps to original locations:
    fromCardNdx.sort(([am, ac], [bm, bc]) => ac.rank - bc.rank); // increasing rank (for up-bumps)
    fromCardNdx.forEach(([meep, card, ndx]) => card.addMeep(meep, ndx)); // back to original slots
    fromCardNdx.forEach(([meep, card, ndx]) => { if (!card.hex) debugger; })
    return [score, `${scoreStr} +${rd}`, meepStr]
  }

  // advanceMeeple will need to decide who/how to bump:
  override chooseBumpee_Ndx(meep: ColMeeple, other: ColMeeple, bumpDir: 'S' | 'N'): [ColMeeple, ndx: number] {
    // TODO: try each dir/bumpee combo to maximise colorScore & rankScore
    // looking ahead/comparing with this.rankScoreNow
    // autoPlayer needs it own version of advanceAndBump
    // happily, pseudoWin will reset all the dudes in the column
    //
    // our 'model' of other player is base class Player?
    // pro'ly subGameSetup will instantiate the same class
    // TODO: set Player.params on each instance 'randomly'
    const card0 = meep.card, card2 = card0.nextCard(bumpDir);
    // const bumpDir = (dir !== 0) ? dir : 1; // TODO: consider each direction
    const bumpStops = this.bumpStops(meep, bumpDir)
    const bestFacs = this.bestFacs(card2);
    // TODO: finish the search/analysis; for now punting to super
    return super.chooseBumpee_Ndx(meep, other, bumpDir)

  }

  // TODO winnerMeep: examine intermediate stop/bump cards/cells
  /** cards on which we could choose to stop our bumping meeple */
  bumpStops(meep: ColMeeple, dir: BumpDir) {
    if (dir == 'SS') { dir = 'S'} // down 1 is an option
    let cardn = meep.card, mustBump = false;
    const cards = [cardn]; // [].push(cardn)
    do {
      cardn = cardn.nextCard(dir)
      cards.push(cardn)
      mustBump = (cardn.hex.row != 0) && (cardn.rank != 0) && (cardn.openCells.length == 0);
    } while (mustBump);
    return cards;
  }
  /**
   * from selectNdx_BumpDir:
   * meep will Advance (dir=1) to card;
   * score for { meep, dir, ndx } [for each ndx]
   */
  override bestBumpInDir(meep: ColMeeple, card: ColCard, dir: BumpDir, ndxs = [0]) {
    // TODO: search tree of {dir, ndx} over cascades (if any)
    const subSetup = this.subGameSetup ?? this.gamePlay.gameSetup;
    if (this.subGameSetup) subSetup.syncGame();
    const subPlay = subSetup.gamePlay;
    const subCard = subPlay.hexMap.getCard(card.rank, card.col);
    const subMeep = subPlay.allMeeples.find(m => m.card.col == meep.card.col && m.card.rank == meep.card.rank && m.cellNdx == meep.cellNdx)!;
    if (subMeep.player.index !== meep.player.index) debugger;
    const scores = ndxs.map(ndx => this.advanceDirNdx_Score(subMeep, subCard, dir, ndx))
    scores.sort((a, b) => b.score - a.score)
    return scores[0]
  }

  advanceDirNdx_Score(meep: ColMeeple, card: ColCard, bumpDir: BumpDir, ndx = 0) {
    const gameSetup = this.subGameSetup ?? this.gamePlay.gameSetup;
    const gamePlay = gameSetup.gamePlay;
    const plyr = gamePlay.allPlayers[this.index];
    const rankScore0 = plyr.rankScoreNow, perTurn = 1 / gamePlay.gameState.turnOfRound

    gamePlay.origMeepCardNdxs = [];
    gamePlay.recordMeep(meep);
    gamePlay.advanceAndBump(meep, card, ndx, bumpDir)

    const [scorec, scoreStr] = gamePlay.scoreForColor(meep, undefined, false)
    const rankDiff = Math.round((plyr.rankScoreNow - rankScore0) * perTurn);
    const rd = Math.max(0, rankDiff); // TODO: per turnOfRound
    const score = scorec + rd;

    gamePlay.restoreMeeps();

    return { meep, card, bumpDir, ndx, score }
  }
}
