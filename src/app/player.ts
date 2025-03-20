import { AT, C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { afterUpdate, UtilButton, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, GamePlay as GamePlayLib, Player as PlayerLib, type HexMap, type NumCounter, type PlayerPanel, type SetupElt as SetupEltLib, Tile, NC, type DragContext, type IHex2, type HexDir } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { CardButton, CB, ColBidButton, ColSelButton, type CardButtonState, type ColId } from "./card-button";
import { ColMeeple } from "./col-meeple";
import type { ColTable, MarkerShape } from "./col-table";
import { arrayN, GamePlay, nFacs, type BumpDir, type Faction, type BumpDirC, type BumpDirP, type BumpDirA, type BumpDir2, type AdvDir, type Step, type CB_Step } from "./game-play";
import { PlayerGameSetup } from "./game-setup";
import type { ColHex2 } from "./ortho-hex";
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
  bidOnCol(colId: ColId): PlyrBid | undefined;
  cancelBid(colId: ColId, bid: number): void;
  /** move the Advancing meeple up one step, choosing card & cellNdx */
  advanceOneMeeple(meeps: ColMeeple[], cb_advanceStep?: CB_Step<AdvDir>): void;
  /** handle first bump from Advance, 'SS' available; choose dir, bumpee, card & cellNdx */
  bumpAfterAdvance(meep: ColMeeple, other: ColMeeple, bumpDirs: BumpDirA[], cb_bumpAdvance?: CB_Step<BumpDir2>): Step<BumpDir2>;
  /** handle cascade bumps; expand <S|N>, choose bumpee, card & cellNdx */
  bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDir: BumpDirC, cb_bumpCascade?: CB_Step<BumpDir>): Step<BumpDir>;
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
    // initialize scores to zero:
    const bndxScore = blackN.map((_, bndx) => ({ bndx, score: 0 }));
    blackN.map(card => card.colId).map((col, bndx) => {
      this.gamePlay.cardsInCol(col).map(card => {
        const facs = card.factions, n = facs.length;
        facs.forEach(f => bndxScore[bndx].score += nfacs[f] / n);
      })
    })
    const rv1 = bndxScore.map((v, bndx) => blackN[bndx].maxCells == 0 ? { bndx, score: 0 } : v)
    const rv0 = rv1.map(({ bndx, score }) => ({ sndx: this.colSelButtons.findIndex(b => b.colId == blackN[bndx].colId), score }));
    const rv = rv0.filter(elt => elt.sndx >= 0); // elt.sndx may be undefined
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
  bidOnCol(colId: ColId) {
    const bid = this.colSelButtons.find(bid => bid.colId == colId)
    return bid?.state === CB.selected ? { plyr: this, bid: this.currentBid } : undefined
  }
  /** value of the current CB.selected ColBidButton */
  get currentBid() { return this.curBidCard.colBid; }
  /** The current CB.selected ColBidButton */
  get curBidCard() {
    return this.colBidButtons.find(b => (b.state === CB.selected)) as ColBidButton;
  }
  get curSelCard() {
    return this.colSelButtons.find(b => (b.state === CB.selected)) as ColSelButton;
  }

  /** End of turn: mark Sel & Bid cards from CB.selected to CB.done */
  doneifyCards() {
    const csb = this.colSelButtons.find(b => b.state === CB.selected);
    const cbb = this.colBidButtons.find(b => b.state === CB.selected);
    if (csb) { csb.setState(CB.done); };
    if (cbb) { cbb.setState(CB.done); cbb.bidOnCol = csb!?.colNum };
  }

  cancelBid(colId: ColId, bid: number) {
    this.colSelButtons.find(sel => sel.colId == colId)?.setState(CB.cancel);
    this.colBidButtons[bid - 1].setState(CB.cancel);
  }

  outBid(colId: ColId, bid: number) {
    this.colSelButtons.find(sel => sel.colId == colId)?.setState(CB.outbid);
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
    this.gamePlay.isPhase('BumpAndCascade')// 'EndRound' --> Score for Rank
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
  manualBumpAndCascade() {

  }
  // TODO: set isLegal on the AdvDir cards
  /** manual mode for ResolveWinnerAndAdvance, BumpAndCascade */
  adviseMeepleDropFunc(meep: ColMeeple, targetHex: ColHex2, ctx: DragContext, xy: XY) {
    if (this.useRobo ) return false;
    const isLegit = meep.isLegalTarget(targetHex, { ...ctx, lastCtrl: false, lastShift: false })
    if (!isLegit) return false; // ctl/shift breaks assertions.
    const { card: fromCard, cellNdx } = meep, fromHex = fromCard.hex;
    // when isLegalTarget is set correctly, ndx & dir will be defined:
    const dir = fromHex.linkDirs.find(dir => fromHex.links[dir] == targetHex)! as BumpDir;
    const asStep = function<T extends AdvDir | BumpDir>(dir: T) {
      return { meep, fromCard, ndx: cellNdx, dir} as Step<T>
    }
    const card = targetHex.card
    const ndx = (card.maxCells == 2) ? (xy.x <= 0 ? 0 : 1) : 0;
    this.gamePlay.moveMeep(meep, card, ndx);

    if (ctx.gameState.isPhase('ResolveWinner') // select Meeple & advDir
      && this.cb_advanceMeep
      && this.meepsToAdvance.includes(meep)
    ) {
      const cb_advanceMeep = this.cb_advanceMeep;    // meepleToAdvance has stashed cb_meepStep
      this.cb_advanceMeep = undefined; // one-shot
      this.meepsToAdvance.forEach(m => m.highlight(false, false));
      afterUpdate(meep, () => cb_advanceMeep(asStep<AdvDir>(dir as AdvDir)), this, 10);
      return true;  // tell dropFunc we have handled it
    }
    if (ctx.gameState.isPhase('BumpAndCascade') // ndx & bumpDir
      && this.cb_moveBumpee // && this.bumpDirs?.length > 0
    ) {
      const cb_moveBumpee = this.cb_moveBumpee;
      this.cb_moveBumpee = undefined;
      afterUpdate(meep, () => cb_moveBumpee(asStep<BumpDir>(dir)), this, 10);
      return true;
    }
    return false;   // not our problem
  }

  readonly bumpDirs1 = ['SS', 'S', 'N'] as BumpDirA[]; // pro-forma default
  meepsToAdvance!: ColMeeple[]
  bumpDirs!: BumpDirA[];  // allowed bumpDirs1 during manual move

  /** when manuAdvanceOneMeeple is done */
  cb_advanceMeep?: (step: Step<AdvDir>) => void;
  /** when manuBumpMeeple is done */
  cb_moveBumpee?: (step: Step<BumpDir>) => void;

  /** From gamPlay.ResolveWinnerAndAdvance: choose a meeple and advance it one rank.
   * @param meeps the available meepsInCol that can be advanced
   * @param cb_advanceMeep callback when meep has taken a Step<AdvDir>
   * @return Step fromCard to meep.card (for auto usage?)
   */
  advanceOneMeeple(meeps: ColMeeple[], cb_advanceMeep?: CB_Step<AdvDir>) {
    // AUTO: subGame will have no cb_meepStep & expects full-auto
    if (this.useRobo || !cb_advanceMeep) return this.autoAdvanceOneMeeple(meeps, cb_advanceMeep)
    // GUI: set dropFunc -> cb_meepStep(meep); so each player does their own D&D
    meeps.forEach(m => m.highlight(true, true)); // light them up!
    this.meepsToAdvance = meeps;
    this.cb_advanceMeep = cb_advanceMeep;
    this.gamePlay.gameState.doneButton(`advance meeple & drop`, this.color);
    this.adviseMeepleDropFunc;
    return [undefined, undefined] as any as ReturnType<Player['autoAdvanceOneMeeple']>;
  }

  /** choose a meeple and moveMeep(meep, fromCard, 'NX') */
  autoAdvanceOneMeeple(meeps: ColMeeple[], cb_meepStep?: CB_Step<AdvDir>) {
    meeps.sort((a, b) => a.card.rank - b.card.rank);
    const meep = this.autoChooseMeepToAdvance(meeps); // overrideable decision
    const fromCard = meep.card, ndx0 = meep.cellNdx!;
    const advDir = this.autoSelectAdvDir(meep);   // assert: links to valid Card
    const step = { meep, fromCard, ndx: ndx0, dir: advDir } as Step<AdvDir>;
    if (fromCard.hex.row > 0) {                   // top black -> no advance
      const advCard = fromCard.nextCard(advDir)!;
      const ndxs = this.gamePlay.cellsForAdvance(advCard)
      const { ndx, bumpDir } = this.autoSelectAdvanceNdx_bumpDir(meep, advCard, this.bumpDirs1, ndxs);
      // TODO: maybe cache bumpDir for moveBumpee/bumpInCascade
      this.gamePlay.moveMeep(meep, advCard, ndx)
    }
    if (cb_meepStep) cb_meepStep(step)
    return step;
  }

  /** meeps is sorted by increasing rank */
  autoChooseMeepToAdvance(meeps: ColMeeple[]) {
    return meeps[0]; // use lowest ranked meep
  }

  /** select N, NW, NE for winner-meep to advance */
  autoSelectAdvDir(meep: ColMeeple) {
    if (!TP.usePyrTopo) return 'N';
    const dirs = ['NW', 'NE'] as AdvDir[];
    const ndx = Random.random(2);  // TODO: something rational
    const dir = dirs[ndx], card = meep.card.nextCard(dir);
    return card ? dir : dirs[1 - ndx];
  }

  /** meep advances to card; pick a cellNdx; choose bumpDir2
   *
   * [choosing bumpDir2 is not really a thing...]
   *
   * gameState.isPhase('BumpAndCascade')
   *
   * @param meep advance or bumpee
   * @param dirs [this.bumpDirs1: 'N', 'S', 'SS'] OR cascade: ['S'] or ['N']
   * @param cb (ndx, bumpDir) -> gamePlay for advanceMeeple -> bumpAndCascade()
   */
  manuMoveBumpee(meep: ColMeeple, other: ColMeeple, dirs = this.bumpDirs1, cb?: CB_Step<BumpDir>) {
    this.bumpDirs = dirs; // for D&D isLegalTarget
    const fromCard = meep.card, ndx = meep.cellNdx, gamePlay = this.gamePlay;
    // TODO: update step.dir
    const step = { meep, fromCard, ndx, dir: 'S'} as Step<BumpDir>;
    // interpose on cb_Ndx_BumpDir
    this.cb_moveBumpee = (step: Step<BumpDir>) => {
      this.cb_moveBumpee = undefined; // one time only
      if (cb) cb(step)
    }
    const cardNdxs = dirs.map(dir => {
      const nextCard = fromCard.nextCard(dir);
      if (!nextCard) return { card: nextCard as any as ColCard, ndxs: [] }// as ReturnType<GamePlay['cellsForBumpee']>;
      return this.gamePlay.cellsForBumpee(nextCard, dir);
    })
    cardNdxs.forEach(({ card, ndxs }) => {
      // TODO set for isLegalTarget
    })
    // TODO wait for adviseMeepleDropFunc to invoke this.cb_Ndx_BumpDir
  }

  /**
   * meep is co-resident with other; move one of them.
   * callback to gameState.moveBumpee(meep:bumpee, step<BumpDirC>)
   *
   * either way - use autoSelectCellNdx_bumpDir() --> dirs.map(dirs=>bestBumpInDir(dir,...))
   * @param meep our meep, just advanced or bumped to meep.card/cellNdx
   * @param other other meep in cell
   * @param dirs [S|N] --> [S|N] OR [SS,S,N] --> [SS|S|N]
   * @param cb_bumpAdvance (Step<BumpDir>) => void;
   * @returns { meep: meep | other, fromCard: card0, ndx: ndx0, dir: BumpDir}
   * * in manual mode, returns with {ndx: -1}
   */
  bumpAfterAdvance(meep: ColMeeple, other: ColMeeple, dirs: BumpDirA[], cb_bumpAdvance?: CB_Step<BumpDir2>) {
    if (this.useRobo) {
      return this.autoBumpMeeple(meep, other, dirs, cb_bumpAdvance);
    }
    this.manuMoveBumpee(meep, other, dirs, cb_bumpAdvance)
    const dirC = (dirs.length == 1 ? dirs[0] : 'S') as BumpDirC; // not the actual dir
    const rv: Step<BumpDir2> = { meep, fromCard: meep.card, ndx: -1, dir: dirC };  // signal manual callback mode.
    cb_bumpAdvance && cb_bumpAdvance(rv);
    return rv;
  }
  /**
   * meep & other co-resident, move one of them.
   * @param meep
   * @param other
   * @param dirs legal bumpDirs; dirs.length = advance ? 3 : 1
   * @returns Step<BumpDirA>
   */
  autoBumpMeeple(meep: ColMeeple, other: ColMeeple, dirs: BumpDirA[], cb_bumpMeeple?: CB_Step<BumpDir2>) {
    const fromCard = meep.card, ndx0 = meep.cellNdx!;
    const ndx_bumpDirs = this.bestBumpInDir([meep, other], fromCard, dirs);
    const { ndx, bumpDir } = ndx_bumpDirs[0];
    const card = fromCard.nextCard(bumpDir)!; // ASSERT: bumpDir --> card
    this.gamePlay.moveMeep(meep, card, ndx);
    const step = { meep, fromCard, ndx: ndx0, dir: bumpDir }// immediate return for pseudo-Players
    cb_bumpMeeple && cb_bumpMeeple(step);
    return step;
  }

  /**
   * meep will Advance (dir='NX') to advCard, select a cellNdx; also BumpDir2 for any bumps
   *
   * Called [only] in auto mode: manual 'resolveWinnerAndAdvance' dropped on the desired cell.
   *
   * Note: the returned 'bumpDir2' is not really/immediately used.
   * The main point here is to select the cell for the advancing meep.
   * The analysis to choose a cell also finds a bumpDir, maybe we can just cache it?
   *
   * @param meep the winner-meep
   * @param advCard the card meep will advance to
   * @param dirs the choice for next bump ('N', 'S') expand when usePyrTopo
   * @param ndxs the available cells to choose
   * @param cb callback when bump & cascade is complete
   * @returns { ndx: cell for meep, bumpDir: bump first meep, other bumps share S/N }
   */
  autoSelectAdvanceNdx_bumpDir(meep: ColMeeple, advCard: ColCard, dirs = this.bumpDirs1, ndxs = [0], cb?: (ndx: number, bumpDir: BumpDir2) => void) {
    // choose the best cellNdx for meep in advCard:
    const ndx_bumpDirs = this.bestBumpInDir([meep], advCard, dirs, ndxs)
    // remove meep, score:
    const { ndx, bumpDir } = ndx_bumpDirs[0];
    return { ndx, bumpDir } // immediate return for auto-mode Players
  }
  /** meep is on card, optimize cellNdx based on score (incl subsequent bumps?)
   *
   * simple score, no lookahead/cascade
   */
  bestBumpInDir(meeps: ColMeeple[], card: ColCard, bumpDirs: BumpDirA[], ndxs = [0]) {
    const ndx_bumpDirs = meeps.map(meep => {
      // enforce no self-bump down when advance:
      const dirs = (bumpDirs.length > 1 && meep.player == this) ? ['N' as BumpDirA] : bumpDirs;
      return dirs.map(dir => {
        const [bndx, score] = this.bestNdxForMe(card, dir), ndx = bndx ?? ndxs[0];
        const bumpDir = dir as BumpDir2; // TODO: choose next bump dir
        return { ndx, bumpDir, meep, score } as { ndx: number, bumpDir: BumpDir2, meep?: ColMeeple, score: number }
      })
    }).flat().sort((a, b) => b.score - a.score);
    if (!ndx_bumpDirs[0]) { ndx_bumpDirs[0] = { ndx: 0, bumpDir: 'S', meep: meeps[0], score: -1 } }
    return ndx_bumpDirs;
  }

  bestFacs(card: ColCard) {
    const factionTotals = this.factionTotals(); // scoreMarkers & bids.inPlay
    const bestFacs = card.factions.slice().sort((a, b) => factionTotals[b] - factionTotals[a]); // descending
    return [bestFacs, factionTotals] as [Faction[], number[]];
  }

  /** ndx of cell that maximizes payoff from advance */
  bestNdxForMe(card: ColCard, bumpDir1: BumpDirA) {
    const [bestFacs, factionTotals] = this.bestFacs(card)
    const bidFacs = this.curBidCard?.factions; // this (pseudo-player) may have no curBidCard
    const fac = bestFacs.find(fac => bidFacs?.includes(fac)); // may be none
    // When (bumpdir == 'N') && (hit myMeep) && (myMeep on bidFac): bump myMeep.
    const mMeep = (bumpDir1 == 'N') ? card.meepsOnCard.find(m => m.player == this) : undefined;
    const mNdx = mMeep?.cellNdx, mBid = (mNdx !== undefined) && bidFacs?.includes(card.factions[mNdx])
    const ndx = mMeep && mBid ? mNdx : (fac !== undefined) ? card.factions.indexOf(fac) : undefined;
    const val = (fac !== undefined) ? factionTotals[fac] : 0;
    return [ndx, val] as [ndx: number | undefined, val: number]
  }
  pyrChoices = {
    N: ['NW', 'NE'] as BumpDirP[],
    S: ['SW', 'SE'] as BumpDirP[],
  }
  /**
   * From advance or bump, meep and other are in same cell, one of them must be bumped.
   *
   * invoked gamePlay.bumpAndCascade()
   *
   * choose bumpee = [meep or other];
   * choose cellNdx for the bumpee
   *
   * SEE ALSO: bumpAfterAdvance(meep: ColMeeple, other: ColMeeple, bumpDir0: BumpDirC)
   */
  bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDirC: BumpDirC, cb_bumpCascade?: CB_Step<BumpDir>) {
    const card0 = meep.card, ndx0 = meep.cellNdx!; this.bumpAfterAdvance
    // TODO: resolve S|N into SE/SW or NE/NW as necesary;
    // choosing a bumpDir that resolves to a card2.
    const bumpDir = !TP.usePyrTopo ? bumpDirC
      : this.pyrChoices[bumpDirC].find(dir => card0.nextCard(dir))!
    const card2 = card0.nextCard(bumpDir)!
    // if other is mine && isOk then bump other (even if, esp if bumpDir == 1)
    if (other.player == this) {
      const [ndx, val] = this.bestNdxForMe(card0, bumpDirC), isOk = (ndx !== undefined);
      // meep.card is good/ok to land, secure that landing and bump our co-agent;
      if (isOk) {
        return this.moveBumpeeToCell(other, bumpDirC, card2)
      }
    }
    if (bumpDir.startsWith('S')) return this.moveBumpeeToCell(other, bumpDirC, card2)
    if (card2.hex.row === 0) return { meep: other, fromCard: card0, ndx: ndx0, dir: 'N' as BumpDirC };
    return this.moveBumpeeToCell(meep, bumpDirC, card2); // bump me/meep up!
  }

  /** wrapper around chooseCellForBumpee(); chooseCell and then moveMeep() */
  moveBumpeeToCell(bumpee: ColMeeple, bumpDir: BumpDirC, card: ColCard) {
    const [meep, dir, ndx2] = this.chooseCellForBumpee(bumpee, bumpDir, card)
    const fromCard = meep.card, ndx = meep.cellNdx!;
    this.gamePlay.moveMeep(meep, card, ndx2); // includes recordMeep()
    const step: Step<BumpDir> = { meep, fromCard, ndx, dir };
    return step
  }
  /** bumpee is being bumped in dir to card: choose cellNdx */
  chooseCellForBumpee(bumpee: ColMeeple, bumpDir: BumpDirC, card: ColCard): [ColMeeple, bumpdir: BumpDir, ndx: number] {
    // TODO:
    // if bumpDir == 1
    // bumpee is ours: hit own-meep so we can re-bump, or bestBid so we can stay;
    // bumpee not ours: hit black or empty to limit cascade
    // else bumpDir == -1 | -2
    // bumpee is ours: try hit bestFacs, else hit something to rebump
    // bumpee not ours: hit something so others re-bump [or not if we are lower in chain]

    // to Black card, it does not matter
    if (card.factions[0] == 0) return [bumpee, bumpDir, 0];
    const nCells = card.factions.length, rand = Random.random(nCells);
    // TODO: finish PlayerB.chooseCellForBumpee; iterate though each 'SXX' variations
    // then we can use nextCard(BumpDir1)
    const card2 = card.nextCard(bumpDir)!, c2isBlk = card2.factions[0] == 0;
    const meepAtNdx = card.meepAtNdx; // entry for each cellNdx;
    if (bumpDir == 'N') {
      if (bumpee.player == this) {
        let ndx = c2isBlk
          ? meepAtNdx.findIndex(meep => meep?.player && (meep?.player !== this)) // try hit our meep
          : meepAtNdx.findIndex(meep => (meep?.player === this)) // try hit our meep
        if (ndx < 0) ndx = c2isBlk
          ? meepAtNdx.findIndex(meep => !meep) // take empty slot
          : meepAtNdx.findIndex(meep => !!meep) // hit any other meep
        if (ndx < 0) ndx = this.bestNdxForMe(card, bumpDir)[0] ?? rand;
        return [bumpee, bumpDir, ndx]
      } else {
        let ndx = meepAtNdx.findIndex(meep => !meep) // take empty slot
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => meep?.player == this) // try hit me
        if (ndx < 0) ndx = rand;
        return [bumpee, bumpDir, ndx]
      }
    } else {
      if (bumpee.player == this) {
        let ndx = this.bestNdxForMe(card, bumpDir)[0] ?? -1;
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => meep?.player && meep.player !== this) // try hit other
        if (ndx < 0) ndx = rand;
        return [bumpee, bumpDir, ndx];
      } else {
        // TODO: if I have a meeple lower down, prefer to hit empty cell?
        const meepAtNdx = card.meepAtNdx; // entry for each cellNdx;
        let ndx = meepAtNdx.findIndex(meep => meep?.player && (meep.player !== this)); // first index with a meep
        if (ndx < 0) ndx = meepAtNdx.findIndex(meep => !!meep); // first index with a meep
        if (ndx < 0) ndx = rand;
        return [bumpee, bumpDir, ndx]
      }
    }
    return [bumpee, bumpDir, 0]
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
    super.setAutoPlay(v);
    afterUpdate(this.autoButton, ()=>{
    if (!this.subGameSetup) this.makeSubGame();
    if (this.gamePlay.isPhase('CollectBids')) {
      setTimeout(() => this.collectBid(), 10);
    }
    })
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
    let sp: ReturnType<PlayerGameSetup['makePlayer']>; // for example...
    const subPlyr = subGamePlay.allPlayers[this.index] as Player; // isa PlayerB
    const colCards = this.colSelButtons.map((b, n) => (b.state === CB.clear) ? subPlyr.colSelButtons[n] : undefined).filter(b => !!b)
    const bidCards = this.colBidButtons.map((b, n) => (b.state === CB.clear) ? subPlyr.colBidButtons[n] : undefined).filter(b => !!b)
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
    const stateInfo = this.subGameSetup.syncGame(); PlayerGameSetup
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
    const col = ccard.colNum, colId = ColSelButton.colNames[col], cardsInCol = gamePlay.cardsInCol(colId);
    const allMeepsInCol = cardsInCol.map(card => card.meepsOnCard).flat()
    const fromCardNdx = allMeepsInCol.map(meep => [meep, meep.card, meep.cellNdx] as [ColMeeple, ColCard, cellNdx: number])
    // player meepsInCol:
    const meepsInCol = gamePlay.meepsInCol(colId, plyr);
    if (meepsInCol.length == 0) {
      return [0, 'no meep to advance/score', '']
    }
    const step = plyr.autoAdvanceOneMeeple(meepsInCol); // choose lowest rank [TODO-each]
    const meep = step.meep;
    gamePlay.gameState.winnerMeep = meep;
    // meep has advanced, step is defined
    const cascDir = step!.dir.startsWith('S') ? 'S' : 'N';
    gamePlay.bumpAndCascade(meep, cascDir); // until bumps have cascaded
    const meepStr = meep.toString();
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
  override bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDir: BumpDirC): Step<BumpDir> {
    // TODO: try each dir/bumpee combo to maximise colorScore & rankScore
    // looking ahead/comparing with this.rankScoreNow
    // autoPlayer needs it own version of bumpAndCascade
    // happily, pseudoWin will reset all the dudes in the column
    //
    // our 'model' of other player is base class Player?
    // pro'ly subGameSetup will instantiate the same class
    // TODO: set Player.params on each instance 'randomly'
    const card0 = meep.card, card2 = card0.nextCard(bumpDir)!;
    // const bumpDir = (dir !== 0) ? dir : 1; // TODO: consider each direction
    const bumpStops = this.bumpStops(meep, bumpDir)
    const bestFacs = this.bestFacs(card2);
    // TODO: finish the search/analysis; for now punting to super
    return super.bumpInCascade(meep, other, bumpDir)

  }

  // TODO: winnerMeep usage; examine intermediate stop/bump cards/cells
  /** cards on which we could choose to stop our bumping meeple */
  bumpStops(meep: ColMeeple, dir: BumpDirC) {
    let cardn: ColCard | undefined = meep.card;
    const cards = [cardn]; // [].push(cardn)
    const dirs = TP.usePyrTopo ? this.pyrChoices[dir] : [dir];
    const openCards = [] as ColCard[];
    const mustBump = function(cardn: ColCard) {
      return (cardn.hex.row != 0) && (cardn.rank != 0) && (cardn.openCells.length == 0);
    }
    const doCard = function (card?: ColCard) {
      if (card) {
        cards.push(card);
        if (mustBump(card) && !openCards.includes(card)) {
          openCards.push(card)
        }
      }
    }
    do {
      if (TP.usePyrTopo) {
        dirs.map(dir => doCard(cardn?.nextCard(dir)))
      } else {
        doCard(cardn.nextCard(dir))
      }
    } while (cardn = openCards.shift());
    return cards;
  }

  override autoSelectAdvanceNdx_bumpDir(meep: ColMeeple, advCard: ColCard, dirs = this.bumpDirs1, ndxs = [0], cb?: (ndx: number, bumpDir: BumpDir2) => void) {
    // TODO: handle simple case where there is one card with one cell
    const subSetup = this.subGameSetup ?? this.gamePlay.gameSetup;
    const stateInfo = subSetup.syncGame(undefined, false); // TODO: is this RIGHT?
    const ndx_bumpDirs = this.bestBumpInDir([meep], advCard, dirs, ndxs)
    // remove meep, score:
    const { ndx, bumpDir } = ndx_bumpDirs[0];
    return { ndx, bumpDir } // immediate return for auto-mode Players
  }

  /**
   * from autoSelectAdvanceNdx_bumpDir or autoBumpMeeple
   * meep will Advance (dir='NX') to card;
   * score for { meep, dir, ndx } [for each ndx]
   * @param meep newly arrived on card @ meep.cellNdx in bumpLoc
   * @param card also has an other meeple @ cellNdx
   * @param dir potential dirs to bump ('N', 'S', 'SS')
   */
  override bestBumpInDir(meeps: ColMeeple[], card: ColCard, bumpDirs: BumpDirA[], ndxs = [0]) {
    // TODO: search tree of {dir, ndx} over cascades (if any)
    const subSetup = this.subGameSetup ?? this.gamePlay.gameSetup;
    if (this.subGameSetup) subSetup.syncGame(); // is this still right?
    const subPlay = subSetup.gamePlay;
    if (!card.hex) debugger;
    const subCard = subPlay.hexMap.getCard(card.rank, card.col);
    const scores = meeps.map(meep => {
      const dirs = (bumpDirs.length > 1 && meep.player.index == this.index) ? ['N' as BumpDirA] : bumpDirs;
      const subMeep = subPlay.allMeeples.find(m => m.pcid == meep.pcid)!;
      if (!subMeep || subMeep.player.index !== meep.player.index) debugger;
      return ndxs.map(ndx =>
        dirs.map(dir => this.scoreForDirNdx(subMeep, subCard, dir, ndx))
      ).flat()
    }).flat();
    scores.sort((a, b) => b.score - a.score)
    if (!scores[0]) { scores[0] = { ndx: 0, bumpDir: 'S', meep: meeps[0], score: -1 } }
    return scores;
    // return scores[0] as { ndx: number, bumpDir: BumpDir2, meep?: ColMeeple, score: number }
  }

  /**
   *
   * @param meep
   * @param card
   * @param bumpDir
   * @param ndx
   * @returns
   */
  scoreForDirNdx(meep: ColMeeple, card: ColCard, bumpDir: BumpDirA, ndx = 0) {
    const gameSetup = this.subGameSetup ?? this.gamePlay.gameSetup;
    const gamePlay = gameSetup.gamePlay;
    const plyr = gamePlay.allPlayers[this.index];
    const rankScore0 = plyr.rankScoreNow, perTurn = 1 / gamePlay.gameState.turnOfRound

    gamePlay.origMeepCardNdxs = [];
    gamePlay.recordMeep(meep);
    let score: number; {
      gamePlay.bumpAndCascade(meep, bumpDir); // with no callback; just move meeps around
      // calls back to this.bumpInCascade()
      const [scorec, scoreStr] = gamePlay.scoreForColor(meep, undefined, false)
      const rankDiff = Math.round((plyr.rankScoreNow - rankScore0) * perTurn);
      const rd = Math.max(0, rankDiff); // TODO: per turnOfRound
      score = scorec + rd;
    }
    gamePlay.restoreMeeps();

    return { meep, bumpDir, ndx, score }
  }
}
