import { AT, C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { UtilButton } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, GamePlay as GamePlayLib, Player as PlayerLib, type HexMap, type NumCounter, type PlayerPanel, type SetupElt as SetupEltLib, Tile } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { CardButton, CB, ColBidButton, ColMeeple, ColSelButton, type CardButtonState } from "./col-meeple";
import type { ColTable, MarkerShape } from "./col-table";
import { arrayN, GamePlay, nFacs } from "./game-play";
import { PlayerGameSetup } from "./game-setup";
import { OrthoHex, type HexMap2 } from "./ortho-hex";
import { TP } from "./table-params";

type PlyrBid = { plyr: Player; bid: number; }
/** interface from GamePlay/GameState to Player */
export interface IPlayer {
  makeMeeple(map: HexMap<OrthoHex>, col: number, rank?: number, ext?: string): ColMeeple;
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
  chooseBumpee_Ndx(meep: ColMeeple, bumpDir: -1 | 1): [ColMeeple, ndx: number]
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
    const gamePlay = this.gamePlay;
    return Math.sum(...arrayN(gamePlay.nRows - 2, 1).map(row => gamePlay.playerScoreForRow(this, row)))
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
    const ymax = this.makeCardButtons(TP.mHexes);  // number of columns
    this.setupCounters(ymax);
    const autoBut = this.autoButton = this.makeAutoButton(1, 'A');
    autoBut.on(S.click, () => this.setAutoPlay(), this); // toggle useRobo
    const redoBut = this.redoButton = this.makeAutoButton(0, 'R');
    redoBut.on(S.click, () => this.selectBid(), this); // select alt bid
  }

  makeCardButtons(ncol = 4, nbid = 4) {
    const opts = { visible: true, bgColor: this.color, player: this }
    const { width, height } = new ColSelButton(0, opts).getBounds(); // temp Button to getBounds()
    const { wide, gap } = this.panel.metrics, gap2 = gap / 2, dx = width + gap;
    const dy = height + gap, panel = this.panel;
    const makeButton = function<T extends CardButton> (claz: Constructor<T>, num: number, row = 0) {
      const x0 = (width / 2) + (wide - (num * dx - gap2)) / 2;
      const y0 = (height / 2) + gap;
      return arrayN(num).map(ndx => {
        const button = new claz(ndx + 1, opts)
        button.x = x0 + dx * ndx;
        button.y = y0 + dy * row;
        panel.addChild(button);
        return button
      })
    }
    this.colSelButtons = makeButton(ColSelButton, ncol, 0);
    this.colBidButtons = makeButton(ColBidButton, nbid, 1);
    const ymax = 2 * dy; // bottom edge of last row of buttons
    return ymax;
  }
  makeAutoButton(n = 1, label = 'A') {
    const { high } = this.panel.metrics, fs = TP.hexRad / 2;
    const autoBut = new UtilButton(label, { visible: true, active: true, border: .1, fontSize: fs })
    autoBut.dy1 = -.1; autoBut.setBounds(undefined, 0, 0, 0);
    autoBut.paint(undefined, true);
    // if (autoBut.cacheID) { autoBut.updateCache() } else { autoBut.setCacheID() }
    autoBut.x = (fs * .5) + 0 * fs; autoBut.y = (high - fs * .55) - n * fs * 1.2;
    this.panel.addChild(autoBut)
    return autoBut
  }
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

  // map col [1..n]
  cardsInCol(col: number) {
    const nRows = this.gamePlay.nRows, hexMap = this.gamePlay.hexMap;
    return arrayN(nRows).map(row => hexMap.getCard(row, col))
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
  /** choose column for xtraMeeple */
  xtraCol() {
    const nCols = this.gamePlay.nCols
    const colScore = this.colScore()
    colScore.sort((a,b) => b.score - a.score)
    const weights = [0], nof = colScore.map((cs, cr) => (nCols - cr) * nCols + 1 + (nCols - cs.col))
    colScore.forEach((cs, cr) => weights.splice(0, 0, ...arrayN(nof[cr], j => cr)))
    const nw = weights.length;
    // {colScore} nw={nw} [{rand}->{ndx}] = {colScore[ndx].col} {nof}
    permute(weights)
    const rand = Random.random(nw)
    const ndx = weights[rand]
    const col = colScore[ndx].col;
    return col
  }

  /** for xtraCol; card.select() -> cardDone = card */
  selectCol() {
    const col = this.xtraCol()
    this.clearButtons();
    console.log(stime(this, `.selectCol: ${this.Aname} - ${col}`));
    this.colSelButtons[col - 1].select()
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
   * @param colNum column
   * @param rank [0]
   * @param ext [''] mark name of xtraCol meeple
   */
  makeMeeple(hexMap: HexMap2, colNum: number, rank = 0, ext = '') {
    Tile.gamePlay = this.gamePlay; // so Meeples can find their GamePlay
    const colId = ColSelButton.colNames[colNum]
    const meep = new ColMeeple(`Meep-${this.index}:${colId}${ext}`, this)
    meep.paint(this.color);
    const card = hexMap.getCard(rank, colNum);
    card.addMeep(meep); // makeMeeple
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
    const factionTotals = ColCard.factionColors.slice(0, 5).map((color, faction) => 0
      + this.meepFactions[faction]
      + markers.reduce((pv, mrk) => pv + (mrk.faction == faction ? 1 : 0), 0)
      + cards.reduce((pv, card) => pv + (card.factions.includes(faction) ? .5 : 0), 0)
    )
    return factionTotals
  }

  /** MarkerShapes on ScoreTrack */
  get markers() {
    const scoreTrack = this.gamePlay.table.scoreTrack, max = scoreTrack.maxValue;
    const markers = scoreTrack.markers[this.index].filter(m => m.value < max);
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
  advanceMarker(dScore: number, cb?: () => void) {
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
      this.autoAdvanceMarker(dScore); // auto-click one of the markers
    }
  }

  autoAdvanceMarker(dScore: number) {
    this.gamePlay.isPhase('BumpAndCascade')// 'EndRound' --> Score for Rank
    const rMax = this.gamePlay.nRows; // max Rank
    const { row, rowScores } = this.gamePlay.gameState.state; // TODO: plan ahead
    const scoreTrack = this.gamePlay.table.scoreTrack, max = scoreTrack.maxValue;
    const allClkrs0 = this.markers.map(m => [m.clicker1, m.clicker2]).flat(1);
    const allClkrs = allClkrs0.filter(clkr => clkr.parent); // shown an GUI...
    allClkrs.sort((a, b) => a.value - b.value); // ascending

    // do not use Black (unless able to land on rMax w/4-bid)
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
    clicker?.onClick()
  }

  /** choose and return one of the indicated meeples */
  meepleToAdvance(meeps: ColMeeple[], colMeep?: (meep?: ColMeeple) => void) {
    // TODO: GUI: set dropFunc -> colMeep(meep); so each player does their own D&D
    const meep = meeps.sort((a, b) => a.card.rank - b.card.rank)[0];
    if (colMeep) colMeep(meep)
    return meep;
  }

  bestFacs(card: ColCard) {
    const factionTotals = this.factionTotals(); // scoreMarkers & bids.inPlay
    const bestFacs = card.factions.slice().sort((a, b) => factionTotals[b] - factionTotals[a]); // descending
    return bestFacs
  }

  readonly bumpDirs = [-2, -1, 1] as (-1 | -2 | 1)[];
  /** meep will Advance (dir=1) to card; select a cellNdx & bumpDir for any bumps */
  selectNdx_BumpDir(meep: ColMeeple, card: ColCard, dirs = this.bumpDirs) {
    const rv = dirs.map(dir => this.bestBumpInDir(meep, card, dir)).sort((a, b) => b.score - a.score)[0]
    const { bumpDir, ndx } = rv
    return { bumpDir, ndx }
  }
  /** put meep on card, optimize cell and meepToBump */
  bestBumpInDir(meep: ColMeeple, card: ColCard, dir: (-2 | -1 | 1)) {
    // TODO: search tree of {dir, ndx} over cascades (if any)
    const score = 2, ndx = 0;
    return { ndx, bumpDir: dir, meep, score }
  }

  /**
   * meep and other are in same cell, one of them must be bumped.
   *
   * choose which to bump also choose bumpDir
   */
  chooseBumpee_Ndx(meep: ColMeeple, bumpDir: -1 | 1): [ColMeeple, ndx: number] {
    const card0 = meep.card, other = card0.otherMeepInCell(meep) as ColMeeple;
    const card2 = card0.nextCard(bumpDir)
    // if other is mine && isOk then bump other
    if (other.player == this) {
      const bestFacs = this.bestFacs(card0)
      const bidFacs = this.curBidCard?.factions ?? [];
      const isOk = !!bestFacs.find(fac => bidFacs.includes(fac)); // card has best fac & best bid
      // meep.card is good/ok to land, secure that landing and bump our co-agent;
      if (isOk) {
        return this.chooseCellForBumpee(other, bumpDir, card2)
      }
    }
    // TODO: ndx for OTHER player
    const ndx = (card2.factions.length !== 2) ? 0 : this.chooseCellToEnter(card2);
    if (bumpDir < 0) return [other, ndx];
    if (card2.hex.row === 0) return [other, 0];
    // TODO: integrate chooseCellToEnter & chooseCellForBumpee
    // Pro'ly using bestBumpInDir()
    const bumpee = (meep.card.rank == 4) ? other : meep;
    return this.chooseCellForBumpee(bumpee, bumpDir, card2)
  }

  /** bumpee is being bumped in dir to card: choose cellNdx */
  chooseCellForBumpee(bumpee: ColMeeple, bumpDir: (1 | -1 | -2), card: ColCard): [ColMeeple, ndx: number] {
    // TODO:
    // bumpDir=1
    // bumpee is ours: hit something so we can re-bump, or bestBid so we can stay;
    // bumpee not ours: hit black or empty to limit cascade
    // else bumpDir == -1 | -2
    // bumpee is ours: try hit bestFacs, else hit something to rebump
    // bumpee not ours: hit something so others re-bump [or not if we are lower in chain]
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
    if (!!gamePlay.table.stage.canvas) {
      console.log(stime(this, `.newGame[${this.index}] ${this.Aname}`))
      setTimeout(() => this.setAutoPlay(true), 10)
    }
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

  autoAdvanceMarkerX(dScore: number) {
    super.autoAdvanceMarker(dScore)
  }

  override setAutoPlay(v?: boolean): void {
    super.setAutoPlay(v);
    if (!this.useRobo) return;
    if (!this.subGameSetup) this.subGameSetup = this.makeSubGame();
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
    const setupElt = state0;
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
    this.selectBid(scores)
  }

  override selectBid(scores = this.latestScores) {
    // deselect prevous bid
    this.colSelButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    this.colBidButtons.forEach(b => (b.state == CB.selected) && b.setState(CB.clear))
    // Sort and select { ccard, bcard } based on score:
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
    const col = ccard.colNum
    const gamePlay = this.subGameSetup.gamePlay;
    const plyr = gamePlay.allPlayers[this.index];
    const rankScore0 = plyr.rankScoreNow, perTurn = 1 / gamePlay.gameState.turnOfRound
    // save original locations:
    const allMeepsInCol = plyr.cardsInCol(col).map(card => card.meepsOnCard).flat()
    const fromCardNdx = allMeepsInCol.map(meep => [meep, meep.card, meep.cellNdx] as [ColMeeple, ColCard, cellNdx: number])
    // player meepsInCol:
    const meepsInCol = gamePlay.meepsInCol(col, plyr);
    const meep = plyr.meepleToAdvance(meepsInCol); // choose lowest rank [TODO-each]
    gamePlay.gameState.winnerMeep = meep;
    const bumpDir = gamePlay.advanceMeeple(meep), meepStr = meep.toString();
    const [scorec, scoreStr] = gamePlay.scoreForColor(meep, undefined, false)
    const rankDiff = Math.round((plyr.rankScoreNow - rankScore0) * perTurn);
    const rd = Math.max(0, rankDiff); // TODO: per turnOfRound
    const score = scorec + rd;
    // restore meeps to original locations:
    fromCardNdx.sort(([am, ac], [bm, bc]) => ac.rank - bc.rank); // increasing rank (for up-bumps)
    fromCardNdx.forEach(([meep, card, ndx]) => card.addMeep(meep, ndx)); // back to original slots
    return [score, `${scoreStr} +${rd}`, meepStr]
  }

  // advanceMeeple will need to decide who/how to bump:
  override chooseBumpee_Ndx(meep: ColMeeple, dir: 1 | -1): [ColMeeple, ndx: number] {
    // TODO: consider bumping other if meep is on colBid faction
    // try each dir/bumpee combo to maximise colorScore & rankScore
    // looking ahead/comparing with this.rankScoreNow
    // autoPlayer needs it own version of bumpAndCascade
    // happily, pseudoWin will rest all the dudes in the column
    //
    // our 'model' of other player is base class Player?
    // pro'ly subGameSetup will instantiate the same class
    // TODO: set Player.params on each instance 'randomly'
    const card = meep.card, other = card.otherMeepInCell(meep) as ColMeeple;
    if (dir == -1) {
      return [other, 0]; // TODO: pick cell...
    }
    // const bumpDir = (dir !== 0) ? dir : 1; // TODO: consider each direction
    const bumpStops = this.bumpStops(meep, dir || 1)
    const bestFacs = this.bestFacs(card);

    const bumpee = (meep.card.rank == 4) ? other : meep;

    return [bumpee, 0];
  }

  // TODO winnerMeep: examine intermediate stop/bump cards/cells
  /** cards on which we could choose to stop our bumping meeple */
  bumpStops(meep: ColMeeple, dir: (1 | -1 | -2)) {
    if (dir == -2) dir = -1;
    let cardn = meep.card, cards = [cardn]; // [].push(cardn)
    do {
      cardn = cardn.nextCard(dir)
      cards.push(cardn)
    } while ((dir == 1) ? cardn.openCells.length == 0 : (cardn.rank == 0 || cardn.cellsInUse.length == 0))
    return cards;
  }
}
