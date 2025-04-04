import { AT, C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { afterUpdate, UtilButton, type TextInRectOptions, type UtilButtonOptions } from "@thegraid/easeljs-lib";
import { NumCounterBox, Player as PlayerLib, Tile, type DragContext, type NumCounter } from "@thegraid/hexlib";
import { CardButton, CB, ColBidButton, ColSelButton, type CardButtonState, type ColId } from "./card-button";
import { ColCard } from "./col-card";
import { ColMeeple } from "./col-meeple";
import type { ColTable, MarkerShape } from "./col-table";
import { arrayN, BD_N, BD_S, BD_SS, GamePlay, nFacs, type AdvDir, type BumpDir, type BumpDir2, type BumpDirA, type BumpDirC, type BumpDn, type BumpDn2, type CB_Step, type Faction, type Step } from "./game-play";
import { SubGameSetup } from "./game-setup";
import type { ColHex2 } from "./ortho-hex";
import { TP } from "./table-params";

type PlyrBid = { plyr: Player; bid: number; }
/** interface from GamePlay/GameState to Player */
export interface ColPlayer extends PlayerLib {
  makeMeeple(colId: ColId, ext?: string): ColMeeple;
  colBidButtons: ColBidButton[]; // { state?: string, factions: number[] }
  clearButtons(): void; // reset CardButton: setState(CB.clear)
  selectCol(): void; // for xtraCol
  collectBid(): void;
  /** inform GameState: this player has committed to selection */
  isDoneSelecting(): ColSelButton | undefined; // { colNum: number } | undefined
  bidOnCol(colId: ColId): PlyrBid | undefined;
  cancelBid(colId: ColId, bid: number): void;
  /** move the Advancing meeple up one step, choosing card & cellNdx */
  advanceOneMeeple(meeps: ColMeeple[], cb_advanceStep?: CB_Step<AdvDir>): void;
  /** choose bumpee, card & cellNdx */
  bumpUp(meep: ColMeeple, other: ColMeeple, cb_bump?: CB_Step<BumpDir2>): Step<BumpDir2> | undefined;
  /** choose bumpee, card & cellNdx */
  bumpDn2(other: ColMeeple, meep?: ColMeeple, cb_bump?: CB_Step<BumpDir2>): Step<BumpDir2> | undefined;
  /** choose bumpee, card & cellNdx */
  bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDirC: BumpDirC, cb_done?: ()=>void): Step<BumpDir> | undefined;
  doneifyCards(): void;
}

export class Player extends PlayerLib implements ColPlayer {
  static initialCoins = 400;
  // set our multi-player colors; we don't use the TP.colorScheme
  // PlayerLib.playerColor(cname|ndx) --> colorScheme[cname]
  static {
    PlayerLib.colorScheme = {
      grey: '#8a8a8a',  // #8a8a8a
      pink: '#FF33CC',  // #FF33CC
      orange: '#FF9900',// #FF9900
      green: '#66CC00', // #66CC00
      brown: '#643a00', // #643a00
      white: 'white',
      blue: 'lightblue',
      tan: 'tan',
      purple: '#bc4ed0',// #bc4ed0
      yellow: 'yellow',
    }
  }

  override get meeples() { return super.meeples as ColMeeple[]; }

  declare gamePlay: GamePlay;

  table: ColTable;
  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
    this.table = gamePlay.table; // for stime.anno
  }

  /** Sum of this player's scoreForRank */
  get rankScoreNow() { return this.rankScore() }
  /** parameterized */
  rankScore(tp_nTopMeeps = TP.nTopMeeps) {
    const scores = this.gamePlay.scoreForRank(tp_nTopMeeps); // all players, ranks, scores
    const myScores = scores.filter(ps => ps.plyr == this).map(ps => ps.score);
    return Math.sum(...myScores)
  }

  /**
   * @param colId
   * @returns meeples of Player in column, candidates for winner.meep
   */
  meepsInCol(colId: ColId) {
    return this.meeples.filter(meep => meep.card.isInCol[colId]);
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
    const autoBut = this.autoButton = this.makeAutoButton(1, 'A');
    autoBut.on(S.click, () => this.setAutoPlay(), this); // toggle useRobo
    const redoBut = this.redoButton = this.makeAutoButton(0, 'R');
    redoBut.on(S.click, () => this.selectBid(), this); // select alt bid
    if (TP.autoStart && !TP.startManual.includes(Player.colorName(this.color)!)) this.setAutoPlay(true);
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
    const ncol = TP.usePyrTopo && !TP.fourBase ? Math.max(nCols, 5) : nCols;
    this.colSelButtons = makeButton(ColSelButton, ncol);
    this.colBidButtons = makeButton(ColBidButton, nbid);
    if (TP.usePyrTopo && !TP.fourBase && this.gamePlay.allPlayers.length < 5) this.colSelButtons.splice(2, 1);
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

  // pro-forma so PlayerB can override
  colSelButtons!: ColSelButton[];
  colBidButtons!: ColBidButton[];

  /** at start of round */
  clearButtons() {
    this.colSelButtons.forEach(b => (b.setState(CB.clear)))
    this.colBidButtons.forEach(b => (b.setState(CB.clear), b.bidOnCol = undefined))
  }
  showMeepsInCol(show = !this.isDoneSelecting()) {
    const colId = this.curSelCard?.colId;
    const meeps = (show && colId) ? this.meepsInCol(colId) : []
    this.gamePlay.meepsToMove = meeps; // highlight
  }

  /** used to select xtraCol  [{ sndx: 0, score}, {sndx: 1, score, ... }] */
  xtraColScore() {
    const hexMap = this.gamePlay.hexMap
    const nfacs = arrayN(1 + nFacs, i => 0); // count of each faction on board
    hexMap.forEachHex(hex => hex.card.factions.forEach(f => nfacs[f]++));

    const colIdScore: Partial<Record<ColId, {colId: ColId, score:number, sndx: number}>> = {};
    this.gamePlay.colIdsInPlay.map(([colId, x], sndx) => {
      colIdScore[colId] = { colId, score: 0, sndx };
      this.gamePlay.cardsInCol(colId).map(card => {
        const facs = card.factions, n = facs.length;
        facs.forEach(f => colIdScore[colId]!.score += nfacs[f] / n);
      })
    })
    return Object.values(colIdScore)
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
    const colId = colScore[ndx].colId;
    return colId // ndx of colSelButtons
  }

  /** for xtraCol; card.select() -> cardDone = card */
  selectCol() {
    const colId = this.xtraCol()
    this.clearButtons();
    console.log(stime(this, `.selectCol: ${this.Aname} -> ${colId} of ${this.gamePlay.nCols}`));
    const sel = this.colSelButtons.find(b => b.colId == colId)
    sel?.select();
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
   * @returns \{ plyr: this, bid: number } | undefined
   */
  bidOnCol(colId: ColId) {
    const bid = this.colSelButtons.find(bid => bid.colId == colId)
    return bid?.state === CB.selected ? { plyr: this, bid: this.currentBid } : undefined
  }
  /** value of the current CB.selected ColBidButton */
  get currentBid() { return this.curBidCard.colBid; }
  /** The current CB.selected ColBidButton */
  get curBidCard() {
    return this.colBidButtons.find(b => (b.state === CB.selected))!;
  }
  get curSelCard() {
    return this.colSelButtons.find(b => (b.state === CB.selected))!;
  }
  get bidStr() {
    return `${this.curSelCard.colId}-${this.curBidCard.colBid}`;
  }
  /** End of turn: mark Sel & Bid cards from CB.selected to CB.done */
  doneifyCards() {
    const csb = this.colSelButtons.find(b => b.state === CB.selected);
    const cbb = this.colBidButtons.find(b => b.state === CB.selected);
    const turn = `${this.gamePlay.gameState.turnOfRound}`
    if (csb) { csb.setState(CB.done); csb.sideNum = turn};
    if (cbb) { cbb.setState(CB.done); cbb.sideNum = turn, cbb.bidOnCol = csb!?.colNum };
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
    // un-select prior manual/user selections:
    this.colSelButtons.forEach(but => but.state == CB.selected && but.setState(CB.clear))
    this.colBidButtons.forEach(but => but.state == CB.selected && but.setState(CB.clear))
    this.auto_collectBid();
  }
  // Score each choice (A1, A2, ..., D3, D4); sort, choose one of the best.
  // simpl_greedy: metric is immediate points scored (plus a bit for rank)
  auto_collectBid() {
    // console.log(stime(this, `.simpleGreedy - ${this.Aname} \n`), this.gamePlay.mapString)
    this.syncSubGame();
    console.groupCollapsed(`${this.Aname}@${this.gamePlay.turnId} collectScores`)
    const scores = this.latestScores = this.subPlyr.collectScores()
    console.groupEnd();
    const [col, bid] = this.selectBid(scores)
    if (this.gamePlay.gameState.turnOfRound == 1 && bid == 1) {
      this.selectBid(scores); // try save (bid == 1) for later; see also score2
    }
    this.autoButton.paint('#c5e1a5')
    this.gamePlay.table.stage.update()
  }
  latestScores!: ReturnType<SubPlayer['collectScores']>

  uniformChoice(scores: ReturnType<SubPlayer['collectScores']>) {
    const ndx = Random.random(scores.length);
    return { ...scores[ndx], ndx }
  }
  fuzzyChoice(scores: ReturnType<SubPlayer['collectScores']>) {
    const ndxs = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3], len = ndxs.length;
    const ndx = permute(ndxs)[Random.random(len)]
    return { ...scores[ndx], ndx };
  }

  selectBid(scores = this.latestScores) {
    if (!scores) return [1, 1]; // spurious click from keybinder before latestScores
    // deselect previous bid
    this.colSelButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    this.colBidButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    // Sort and select { ccard, bcard } based on score:
    scores.sort((a, b) => b.score! - a.score!);// descending
    const score0 = scores[0].score!
    // when desparate, include playing the black:
    const desparate = this.gamePlay.turnNumber > 0 && this.score < this.gamePlay.gameState.roundNumber;
    const scores0 = scores.filter(({ colBid, score }) => (score == score0) || (colBid == 4 && desparate));
    const slen= scores0.length;
    // copy the results for logging:
    const scc = scores0.map(({ colId, colBid, score, meep, scoreStr }) => [colId, colBid, score, meep, scoreStr])
    const sc5 = scores.map(({ colId, colBid, score, meep, scoreStr }) => [colId, colBid, score, meep, scoreStr])
    // if (scoress.length < 3) debugger;
    // choose a col/bid pair:
    const { colId, colBid, score, meep, ndx } = (slen >= 1)
      ? this.uniformChoice(scores0)
      : this.fuzzyChoice(scores);
    // translate to *this* player:
    const colCard = this.colSelButtons.find(b => b.colId == colId)!
    const bidCard = this.colBidButtons.find(b => b.colBid == colBid)!
    const plyrId = AT.ansiText(['red', 'bold'], this.Aname)
    const ndxStr = AT.ansiText([slen == 1 ? 'red' : 'blue', 'bold'], `${ndx}/${slen}`)
    console.log(stime(this, `.selectBid: ${plyrId} [${ndxStr}] ${colId}-${colBid} => ${score0.toFixed(1)} meep=${meep}\n`), scc, sc5)
    colCard.select()
    bidCard.select()
    return [colCard.colNum, bidCard.colBid]
  }

  saveCardStates() {
    const sels = this.colSelButtons.map(b => b.state as CardButtonState);
    const bids = this.colBidButtons.map(b => b.state as CardButtonState);
    return { sels, bids }
  }

  parseCardStates(pStates: ReturnType<Player['saveCardStates']>) {
    const { sels, bids } = pStates
    sels.forEach((sel, ndx) => this.colSelButtons[ndx].setState(sel, false))
    bids.forEach((bid, ndx) => this.colBidButtons[ndx].setState(bid, false))
    return
  }

  // ColMeeple is Tile with (isMeep==true); use MeepleShape as baseShape
  /**
   * make ColMeeple, add to ColCard @ {column, rank}
   * @param hexMap
   * @param colId where this meeple starts the game
   * @param ext [''] '*' if is the xtra Meeple in colId
   */
  makeMeeple(colId: string, ext = '') {
    Tile.gamePlay = this.gamePlay; // so Meeples can find their GamePlay
    const cid = `${colId}${ext}`;
    const meep = new ColMeeple(cid, this)
    meep.paint(this.color);
    this.gamePlay.table.makeDragable(meep);
    return meep;
  }

  factionCounters: NumCounter[] = [];
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
    this.gamePlay.gameState.doneButton(`Score: ${dScore}`, this.color)
    // this.panel.stage?.update();
    if (this.useRobo || TP.autoScore) {        // re-enable manual version
      this.autoAdvanceMarker(dScore, rowScores); // auto-click one of the markers
    }
  }

  /**
   * clickers are already on (marker.value + dScore); pick one.
   * @param dScore score points earned; advance one marker by dScore
   * @param rowScores [empty when doing scoreForColor]
   */
  autoAdvanceMarker(dScore: number, rowScores: ReturnType<GamePlay["scoreForRank"]>) {
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

    // cross the finish line: sometimes is better to get one across, so one [big] score can finish.
    // other times maximize income by bringing up the rear so both are in range for next 2 scores.
    const anticipatedBigScore = 0; // TODO: look ahead...
    const maxes = allClkrs.filter(clk => clk.value == max)
    maxes.sort((a, b) => a.marker!.value - b.marker!.value); // ascending
    const clicker = (maxes.length == 1 && (maxes[0].marker!.value + dScore) == max)
      ? maxes[0] // exactly hits max; can't do better than that.
      : (maxes.length > 1)
        ? ((maxes[0].marker!.value + anticipatedBigScore) >= max)
          ? maxes[1] : maxes[0]
        : allClkrs[0];      // lowest mrkr of the most present faction
    if (!clicker) debugger; // Player maxed out
    clicker?.onClick();    // {clicker.marker.value} -> {clicker.value}
  }

  readonly bumpDirsA = ['SS', 'S', 'N'] as BumpDirA[]; // pro-forma default

  /** true: Player delgates to SubPlayer; false: Player delegates to GUI */
  setAutoPlay(v = !this.useRobo): void {
    this.useRobo = v; // TODO: set autoScore = v; ??
    this.autoButton.paint(v ? C.YELLOW : C.WHITE)
    this.autoButton.stage?.update();
    if (!v) return;
    afterUpdate(this.autoButton, () => {
      if (!this.useRobo) return;
      if (!this.subGameSetup) this.makeSubGame();
      if (this.gamePlay.isPhase('CollectBids')) {
        setTimeout(() => this.collectBid(), 10);
      }
    })
  }

  subGameSetup!: SubGameSetup;
  subGame!: GamePlay;
  subPlyr!: SubPlayer;
  makeSubGame() {
    const gameSetup = this.gamePlay.gameSetup;
    const state0 = gameSetup.startupScenario;
    const setupElt = { ...state0, n: TP.numPlayers };
    setupElt.Aname = `${this.Aname}-subGame`;
    // game with no canvas for Stage:
    const subSetup = this.subGameSetup = new SubGameSetup(gameSetup, setupElt);
    const subGame = this.subGame = subSetup.gamePlay;
    const allPlayers = subGame.allPlayers as ReturnType<SubGameSetup['makePlayer']>[];
    this.subPlyr = allPlayers.find(plyr => plyr.index == this.index)!;
    if (!this.subPlyr) debugger;
    this.syncSubGame(false);   // do first/full sync
    return subSetup
  }
  syncSubGame(update = true) {
    const stateInfo = this.gamePlay.scenarioParser.saveState(false);
    stateInfo.update = update;
    this.subGame.parseScenario(stateInfo);
    this.subGame.gameState.winnerMeep = this.gamePlay.gameState.winnerMeep;
    this.subGame.cascDir = this.gamePlay.cascDir;
    if (update) {
      // this.subGame.scenarioParser.placeMeeplesOnMap(layout, false);
      this.subGame.recordMeeps(false);
    }
  }
  myStep<T extends BumpDir2>(step: Step<T>) {
    const meep = this.gamePlay.allMeeples.find(m => m.pcid == step.meep.pcid)!
    const fromCard = meep.card, dir = step.dir, ndx = step.ndx;
    const card = meep.card.nextCard(dir)!;
    this.gamePlay.moveMeep(meep, card, ndx);
    return { meep, fromCard, dir, ndx } as Step<T>
  }
  subMeeps(...meeps: ColMeeple[]) {
    return meeps.map(meep => this.subGame.allMeeples.find(m => m.pcid == meep.pcid)!)
  }

  moveMeepWithCB(meep: ColMeeple, other: ColMeeple, dir: BumpDirA, doneStr: string, cb?: CB_Step<any>) {
    if (!this.useRobo) {
      return this.manuMoveMeeps([meep, other], dir, doneStr, cb);
    }
    this.syncSubGame();
    const step = this.subPlyr.bestMove([meep, other], dir);
    const toCard = step.fromCard.nextCard(step.dir)!;
    this.gamePlay.moveMeep(step.meep, toCard, step.ndx);
    cb && cb(step);
    return step
  }

  /** for manual mode */
  adviseMeepleDropFunc(meep: ColMeeple, targetHex: ColHex2, ctx: DragContext, xy: XY) {
    const gamePlay = this.gamePlay;
    if (gamePlay.curPlayer.useRobo ) return false;
    if (!meep.isMoveMeep) return false;
    if (!gamePlay.isMovePhase) return false;
    if (!gamePlay.cb_moveMeeps) return false;
    const isLegit = meep.isLegalTarget(targetHex, { ...ctx, lastCtrl: false, lastShift: false })
    if (!isLegit) return false; // ctl/shift breaks assertions.

    const { card: fromCard, cellNdx } = meep, fromHex = fromCard.hex;
    // when isLegalTarget is set correctly, ndx & dir will be defined:
    const dir = fromHex.linkDirs.find(dir => fromHex.links[dir] == targetHex)! as BumpDir;
    const asStep = function<T extends AdvDir | BumpDir>(dir: T) {
      return { meep, fromCard, ndx: cellNdx, dir } as Step<T>
    }
    const card = targetHex.card
    const ndx = (card.maxCells == 2) ? (xy.x <= 0 ? 0 : 1) : 0;
    gamePlay.moveMeep(meep, card, ndx);
    const step = asStep<AdvDir>(dir as AdvDir)
    console.log(stime(this, `.adviseDrop: fromCard=${fromCard}#${ndx}[${dir}] -> ${meep}`))
    return gamePlay.cb_moveMeeps(step);
  }

  /** meep advances to card; pick a cellNdx;
   *
   * adviseMeepleDropFunc infers the initial bumpDir.
   *
   * @param meep to advance or bump
   * @param dirA: 'N' | 'SS' | 'S'
   * @param cb CB_Step\<any> --> gamePlay for advanceMeeple -> bumpAndCascade()
   */
  manuMoveMeeps(meeps: ColMeeple[], dirA: BumpDirA, doneStr: string
    , cb?: CB_Step<BumpDir2> | CB_Step<AdvDir> | CB_Step<BumpDn>) {
    this.gamePlay.meepsToMove = meeps.filter(m => m);// before move: many; after: 2 or 0
    this.gamePlay.dragDirs = this.allDirs(dirA);
    this.gamePlay.cb_moveMeeps = (step: Step<BumpDir2>) => {
      this.gamePlay.cb_moveMeeps = undefined; // one time only
      if (cb) (cb as CB_Step<BumpDir2>)(step); // pretty sure cb must be defined
      return true;
    }
    if (doneStr) {
      this.gamePlay.gameState.doneButton(doneStr, this.color);
      this.gamePlay.gameState.whenDoneClicked(() => {
        console.log(stime(`manuMoveMeeps.doneClicked: meepsToMove =`), this.gamePlay.meepsToMove)
      })
    }
    return undefined;
  }

  /** From gamPlay.ResolveWinnerAndAdvance: choose a meeple and advance it one rank.
   *
   * choose meep, card & cellNdx; moveMeep(meep, card, cellNdx)
   * @param meeps the available meepsInCol that can be advanced
   * @param cb_advanceMeep callback when meep has taken a Step<AdvDir>
   * @return Step fromCard to meep.card
   */
  advanceOneMeeple(meeps: ColMeeple[], cb_advanceMeep?: CB_Step<AdvDir>): Step<AdvDir> | undefined {
    if (!this.useRobo || !cb_advanceMeep) {
      this.manuMoveMeeps(meeps, BD_N, `advance meeple`, cb_advanceMeep)
      return
    }
    this.syncSubGame();
    const subMeeps = this.subMeeps(...meeps);
    console.groupCollapsed(`${this.Aname}@${this.gamePlay.turnId} advanceOneMeeple`)
    console.log(stime(this, `.advanceOneMeeple: meep =`), meeps.map(m => m?.toString()))
    const subStep = this.subPlyr.advanceOneMeeple(subMeeps)
    console.groupEnd()
    const step = this.myStep(subStep);
    if (!meeps.includes(step.meep)) debugger;
    cb_advanceMeep && cb_advanceMeep(step)
    return step;
  }

  /** choose bumpee, card & cellNdx after advance on self (or row1) */
  bumpUp(meep: ColMeeple, other: ColMeeple, cb_bump?: CB_Step<AdvDir>) {
    if (!this.useRobo) {
      this.manuMoveMeeps([meep, other], BD_N, 'bumpUp', cb_bump);
      return;
    }
    this.syncSubGame();
    const [subMeep, subOther] = this.subMeeps(meep, other);
    const subStep = this.subPlyr.bumpUp(subMeep, subOther)
    const step = this.myStep(subStep);
    cb_bump && cb_bump(step);
    return step;
  }
  /** choose bumpee, card & cellNdx; after advance on other */
  bumpDn2(other: ColMeeple, meep?: ColMeeple, cb_bump?: CB_Step<BumpDir2>) {
    // is bumpFromAdvance; cannot bump your own meep down/down2
    if (!this.useRobo) {
      this.manuMoveMeeps([other], BD_SS, 'bumpDn2', cb_bump);
      return;
    }
    this.syncSubGame();
    const [subOther] = this.subMeeps(other);
    console.groupCollapsed(stime(this, `.bumpDn2: ${this.Aname}@${this.gamePlay.turnId} ${other.toString()}`))
    // from advance: not allowed to bump own meep down
    const subStep = this.subPlyr.bumpDn2(subOther); // meep.player.subPlayer;
    console.groupEnd();
    const step = this.myStep(subStep);
    cb_bump && cb_bump(step);
    return step;
  }

  /** could be bumpUp or bumpDn; meep.player.bumpInCascade(meep, ...) */
  bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDirC: BumpDirC, bumpDone?: () => void): Step<BumpDir> | undefined {
    if (!this.useRobo) {
      this.manuMoveMeeps([meep, other], bumpDirC, bumpDirC == BD_S ? 'bumpDn' : 'bumpUp', bumpDone);
      return undefined;
    }
    // auto-mode: subPlyr.bumpInCascade -> gamePlay.bumpAndCascade -> plyr.bumpInCascade
    this.syncSubGame();
    const [subMeep, subOther] = this.subMeeps(meep, other);
    console.groupCollapsed(stime(this, `.bumpInCascade: ${this.Aname}@${this.gamePlay.turnId}`))
    console.log(stime(this, `.bumpInCascade: ${[meep, other].map(m => m.toString())}`))
    const subStep = this.subPlyr.bumpInCascade(subMeep, subOther, bumpDirC, undefined, true);
    console.groupEnd()
    const step = this.myStep(subStep);
    return step;
  }

  pyrChoices = {
    N: ['NW', 'NE'] as AdvDir[],
    S: ['SW', 'SE'] as BumpDn[],
    SS: ['SS'] as BumpDn2[],  // nextCard can handle SS
  }
  _allDirs = {
    N: ['NW', 'NE'] as AdvDir[],
    S: ['SW', 'SE'] as BumpDn[],
    SS: ['SS', 'SW', 'SE' ] as BumpDn2[],  // nextCard can handle SS
  }

  allDirs(dir: BumpDirA): BumpDir2[] {
    return (TP.usePyrTopo || dir == BD_SS) ? this._allDirs[dir] : [dir];
  }

  /** count of meeples on each Faction [B, r, g, b, v, W] */
  get meepFactions() {
    const counts = arrayN(2 + nFacs, i => 0); // B + 4
    this.meeples.forEach(meep => counts[meep.faction!]++)// ASSERT: faction is defined
    counts.forEach((cnt, ndx) => ndx > 0 && (counts[ndx] += counts[5]))
    return counts;
  }
  /** Put Meeple.faction count into panel.factionCounters */
  setFactionCounters() {
    const meepFactions = this.meepFactions;
    this.factionCounters.forEach((fc, i) => fc.setValue(meepFactions[i]))
    this.panel.stage.update();
  }
}

/** A fully automated player; lives in a SubGame */
export class SubPlayer extends Player {

  /** play each combo of (clear) Sel & Bid cards, return list of bestMove score */
  collectScores() {
    const colCards = this.colSelButtons.filter(sel => (sel.state === CB.clear));
    const bidCards = this.colBidButtons.filter(bid => (bid.state === CB.clear));
    const scores2 = [] as typeof scores;
    const scores = colCards.map(ccard =>
      bidCards.map(bcard => {
        // mark 'selected' for scoreForColor; no other players -> never gamePlay.allDone()
        ccard.setState(CB.selected, false);
        bcard.setState(CB.selected, false);
        const colId = ccard.colId;
        const meepsInCol = this.meepsInCol(colId);
        /** pretend ccard,bcard win, and advance in col */
        const step = this.pseudoWin(meepsInCol); // this == meep.this
        let { score, scoreStr, meepStr } = step;
        const rv = { colId: ccard.colId, colBid: bcard.colBid, score: score!, meep: step?.meep, scoreStr: scoreStr! }
        // prefer to bid 2|3 instead of 1:
        if ([2, 3].includes(bcard.colBid)) { scores2.push(rv); }
        ccard.setState(CB.clear);
        bcard.setState(CB.clear);
        return rv
      })
    ).flat()
    return scores.concat(scores2); // may have {score: -1, meep: undefined}
  }

  /** set initial conditions for bestMove() */
  pseudoWin(meepsInCol: ColMeeple[]) {
    if (meepsInCol.length == 0)
      return { score: -1, scoreStr: `${this.Aname}: no meep in col-${this.bidStr}`, meepStr: '' } as ReturnType<SubPlayer['bestMove']>
    this.baselineScore();
    return this.bestMove(meepsInCol, BD_N, true);
  }
  baselineScore() {
    // const gamePlay = this.gamePlay;
    // const uberPhase = (gamePlay.gameSetup as SubGameSetup).gs.gamePlay.gamePhase.Aname
    // const isCollect = uberPhase == 'CollectBids';   // analyze all my meeps
    // const isAdvance = uberPhase == 'ResolveWinner'; // analyze my meepsInCol
    // const bumpAdv = uberPhase == 'BumpFromAdvance'; // other(SS, S) or either(N)
    // const bumpCasc = uberPhase == 'BumpAndCascade'; // either(S, N)

    const tPlyr = this.topPlayer;
    // if (isCollect || isAdvance) {
    this.tRankScore0 = tPlyr.rankScore(0);
    this.myRankScore0 = this.rankScore(0);
    // }
  }
  /** highest scoring *other* player. */
  get topPlayer() {
    const plyrsRanked = this.gamePlay.allPlayers.slice().sort((a, b) => b.score - a.score);
    const tPlyr = plyrsRanked.find(p => p !== this)!;
    return tPlyr;
  }

  bestMove(meeps: ColMeeple[], dir: BumpDirA, isAdv = false) {
    return this.evalMoves(meeps, dir, isAdv)[0];
  }

  tRankScore0 = 0;  // score for current leader/threat
  myRankScore0 = 0;
  myColorScore = 0;
  myColorStr = '';

  /**
   * record meeps; rankScore0;
   *
   * move each meep in dir, trying all cards & ndxs; calc & record score.
   *
   * restore meeps
   *
   * Will be called reentrantly, by bumpee.player; so we get min-max at each move.
   * @param meeps isAdv ? meepsInCol : [meep, other]
   * @param dirA N, S, SS
   * @param isAdv [false] true when advanceOneMeeple
   * @returns [step, score, scoreStr, meepStr][]
   */
  evalMoves(meeps: ColMeeple[], dirA: BumpDirA, isAdv = false) {
    const plyr = this, tPlyr = this.topPlayer, gamePlay = this.gamePlay;
    const dirs = this.allDirs(dirA); // assert either isAdv OR dir already constrained by cascDir

    const perTurn = 1 / (4 - gamePlay.gameState.turnOfRound);
    gamePlay.recordMeeps();   // start new record

    const scores = meeps.filter(m => m).map(meep => {
      const fromCard = meep.card;
      return dirs.map(dir => {
        const toCard = fromCard.nextCard(dir)
        if (!toCard) return undefined;
        const ndxs = isAdv ? gamePlay.cellsForAdvance(toCard) : gamePlay.cellsForBumpee(toCard, dir).ndxs;
        return ndxs.map(ndx => {
          // the actual, reported Step for meep:
          const step = { meep, fromCard, dir, ndx, meepStr: meep.toString() } as Step<BumpDir2>
          this.gamePlay.recordMeeps()
          // moveMeep(toCard,ndx) and see what else is sitting there:
          const other = gamePlay.moveMeep(meep, toCard, ndx);
          let bumpee = meep;
          if (isAdv) { // set winnerMeep, and cascadeDir (if bumping)
            this.gamePlay.gameState.winnerMeep = meep;
            console.log(stime(this, `.evalMove.isAdv: ${meep} & ${other ?? '-'}`))
            if (other) {
              // bump & move meep or other, and set cascadeDir:
              const bStep = gamePlay.bumpAfterAdvance(meep, other)!
              bumpee = bStep.meep;
            }
          }
          // loop if bumpee while bumpee has an other:
          gamePlay.bumpAndCascade(bumpee); // --> meep.player.bumpAndCascade()
          // ASSERT: moves and cascades have stopped;
          if (meep == this.gamePlay.gameState.winnerMeep) {
            const [scorec, colorStr] = gamePlay.scoreForColor(meep, undefined, false)
            this.myColorScore = scorec;
            this.myColorStr = colorStr;
          } else if (meep.player.index !== this.gamePlay.gameState.winnerMeep?.player.index) {
            this.myColorScore = 0;
            this.myColorStr = '0';
          }
          const tRankDiff: number = ((tPlyr.rankScore(0) - this.tRankScore0) * perTurn);
          const myRankDiff: number = ((plyr.rankScore(0) - this.myRankScore0) * perTurn);
          const rd = (myRankDiff - tRankDiff); // good if I go up or T goes down;
          const score = this.myColorScore + rd, scoreStr = `${this.myColorStr}+${rd.toFixed(1)}`;
          const meepStr = meep.toString();  // final location of meep;
          this.gamePlay.restoreMeeps();
          step.meepStr = meepStr;
          step.score = score;
          step.scoreStr = scoreStr;
          return step
        })
      }).flat().filter(v => !!v)
    }).flat()
    // restore meeps to original locations:
    gamePlay.restoreMeeps();
    permute(scores);
    scores.sort((a, b) => b.score! - a.score!)
    return scores;
  }

  /** From gamePlay.ResolveWinnerAndAdvance (or collectScores): choose a meeple and advance it one rank.
   * @param meeps the available meepsInCol that can be advanced
   * @param cb_advanceMeep callback not used
   * @return Step meep moved to fromCard.nextCard(dir, ndx)
   */
  override advanceOneMeeple(meeps: ColMeeple[]): Step<AdvDir> {
    if (meeps.length == 0) debugger;
    const step = this.bestMove(meeps, BD_N, true) as Step<AdvDir>;
    if (!step) debugger;
    const toCard = step.fromCard.nextCard(step.dir)!;
    this.gamePlay.moveMeep(step.meep, toCard, step.ndx);
    return step;
  }

  /** choose bumpee, card & cellNdx -> Step<AdvDir> */
  override bumpUp(meep: ColMeeple, other: ColMeeple) {
    const step = this.bestMove([meep, other], BD_N) as Step<AdvDir>;
    if (!step) debugger;
    const toCard = step.fromCard.nextCard(step.dir)!;
    this.gamePlay.moveMeep(step.meep, toCard, step.ndx);
    return step;
  }
  /** choose bumpee, card & cellNdx */
  override bumpDn2(other: ColMeeple) {
    const step = this.bestMove([other], BD_SS) as Step<BumpDir2>;
    if (!step) debugger;
    const toCard = step.fromCard.nextCard(step.dir)!;
    this.gamePlay.moveMeep(step.meep, toCard, step.ndx);
    return step;
  }

  /** could be bumpUp or bumpDn */
  override bumpInCascade(meep: ColMeeple, other: ColMeeple, bumpDirC: BumpDirC, cb?: ()=> void, topLevel = false): Step<BumpDir> {
    if (topLevel) this.baselineScore();
    const step = this.bestMove([meep, other], bumpDirC) as Step<BumpDir>;
    if (!step) debugger;
    const toCard = step.fromCard.nextCard(step.dir)!;
    this.gamePlay.moveMeep(step.meep, toCard, step.ndx);
    return step;
  }

}
