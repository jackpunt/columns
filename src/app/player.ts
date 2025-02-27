import { AT, C, permute, Random, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { UtilButton } from "@thegraid/easeljs-lib";
import { newPlanner, NumCounterBox, GamePlay as GamePlayLib, Player as PlayerLib, type HexMap, type NumCounter, type PlayerPanel, type SetupElt as SetupEltLib } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { CardButton, CB, ColBidButton, ColMeeple, ColSelButton, type CardButtonState } from "./col-meeple";
import type { MarkerShape } from "./col-table";
// import { GameModel } from "./game-model";
import { arrayN, GamePlay, nFacs, type Faction } from "./game-play";
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
  /** @param dir 0: advance, 1: up, -1, -2: down */
  bumpMeeple(meep: ColMeeple, dir: (0 | 1 | -1 | -2), cb?: () => void): boolean;
  commitCards(): void;
}

export type PlayerColor = string;
export class Player extends PlayerLib implements IPlayer {
  static initialCoins = 400;
  // set our multi-player colors; we don't use the TP.colorScheme
  // PlayerLib.playerColor(cname|ndx) --> colorScheme[cname]
  static {
    PlayerLib.colorScheme = {
      brown: '#784600', // #663300
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

  // declare static allPlayers: Player[];

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
  // 4 ColBid cards (shrink to buttons, disable when played)
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

  makeCardButtons(ncol = 4, nbid = 4) {
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
    this.colBidButtons = makeButton(ColBidButton, nbid, 1) as ColBidButton[];
    const ymax = 2 * dy; // bottom edge of last row of buttons
    return ymax;
  }
  makeAutoButton() {
    const { high } = this.panel.metrics, fs = TP.hexRad / 2;
    const autoBut = this.autoButton = new UtilButton('A', { visible: true, active: true, border: .1, fontSize: fs })
    autoBut.x = 0 + fs * .5; autoBut.y = high - fs * .6;
    this.panel.addChild(autoBut)
    autoBut.on(S.click, () => this.setAutoPlay(), this); // toggle useRobo
  }
  autoButton!: UtilButton;

  /** true: player auto-selects play; false: player uses GUI  */
  setAutoPlay(v = !this.useRobo) {
    this.useRobo = v;
    this.autoButton.paint(this.useRobo ? '#c5e1a5' : C.WHITE)
    this.autoButton.stage?.update();
  }

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
  commitCards() {
    const csb = this.colSelButtons.find(b => b.state === CB.selected);
    const cbb = this.colBidButtons.find(b => b.state === CB.selected);
    if (csb) { csb.setState(CB.done); };
    if (cbb) { cbb.setState(CB.done); cbb.bidOnCol = csb!?.colNum - 1 };
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
    this. scoreCounters[marker.index].setValue(marker.value, color);
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
    // TODO: GUI: set dropFunc -> colMeep(meep)
    const meep = meeps.sort((a, b) => a.card.rank - b.card.rank)[0];
    if (colMeep) colMeep(meep)
    return meep;
  }

  /** this player moves meep, and invokes bumpee.bumpMeeple.
   * invoke cb() when bump cascade if done (no bumpee, or bump to black)
   *
   * @param meep the meep that need to find a home
   * @param dir the direction for this bump (0 for initial/winningBidder: up & then choose bumpDir)
   * @returns true if bump cascades
   */
  bumpMeeple(meep: ColMeeple, dir: (0 | 1 | -1 | -2)) {
    const dir0 = dir || 1;  // (dir0 == 0) IFF advance/winner
    const card = meep.card.nextCard(dir0);   // should NOT bump from black, but...
    const open = card.openCells, ol = open.length, cardFacs = card.factions;
    const cellNdx = (ol > 0 && (ol == 1 || ol < cardFacs.length))
      ? open[0] // take the open slot (or next slot of Black card)
      : this.chooseCellToEnter(card)
    const toBump = card.addMeep(meep, cellNdx); // place in chosen cellNdx
    return toBump;
  }

  /** choose meep to bump; if winning-bidder (dir == 0) also choose bumpDir  */
  chooseMeepAndBumpDir(meep: ColMeeple, dir: 0 | 1 | -1 | -2): [ColMeeple, 1 | -1 | -2] {
    const other = meep.card.otherMeepInCell(meep) as ColMeeple;
    const bumpDir = (dir !== 0) ? dir : 1; // TODO: more consideration
    // if other is mine && card.fac.includes(bidFac) -> bump other
    if (other.player == this) {
      const factionTotals = this.factionTotals(); // scoreMarkers & bids.inPlay
      const bestFacs = meep.card.factions.slice().sort((a, b) => factionTotals[b] - factionTotals[a]); // descending
      const bidFacs = this.curBidCard?.factions ?? [];
      const bestBid = bestFacs.find(fac => bidFacs.includes(fac));
      const sw = bestBid && meep.card.factions.includes(bestBid)
      if (!!sw || meep.card.factions.find(fac => bidFacs.includes(fac)))
        return [other, bumpDir]
    }
    const bumpee = (meep.card.rank == 4) ? other : meep;
    return [bumpee, bumpDir];
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
    if (this.useRobo && !this.subGameSetup) this.subGameSetup = this.makeSubGame();
    if (this.gamePlay.isPhase('CollectBids')) {
    setTimeout(() => {
        this.collectBid();
    }, 100);
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

  // find top 4 apparent best moves (A1, A2, ..., D3, D4); choose one.
  // metric is immediate points scored
  collectBid_simpleGreedy() {
    // sync subGame with realGame
    this.subGameSetup.syncGame(); PlayerGameSetup
    const subGamePlay = this.subGameSetup.gamePlay; GamePlay;
    const subPlyr = subGamePlay.allPlayers[this.index] as PlayerB;
    const colCards = this.colSelButtons.filter(c => c.state === CB.clear).map(c => subPlyr.colSelButtons[c.colNum - 1])
    const bidCards = this.colBidButtons.filter(b => b.state == CB.clear).map(b => subPlyr.colBidButtons[b.colBid - 1])
    const scores = colCards.map(ccard =>
      bidCards.map(bcard => {
        // enable faction match, without triggering isDoneSelecting()
        ccard.setState(CB.selected);
        bcard.setState(CB.selected);
        let score = this.pseudoWin(ccard, bcard); // advance in ccard.col
        if (subGamePlay.turnNumber > 0 && this.score < 3) {
          if (bcard.colBid == 4) { score = -1; }  // marker: include in scores0
        }
        const meep = subGamePlay.gameState.winnerMeep?.toString();
        ccard.setState(CB.clear);
        bcard.setState(CB.clear);
        return { ccard, bcard, score, meep }
      })
    )
    const scoress = scores.flat().sort((a, b) => b.score - a.score);// descending
    const score0 = scoress[0].score
    const scores0 = scoress.filter(({score}) => (score == score0) || (score == -1)), slen= scores0.length;
    const scc = scores0.map(({ ccard, bcard, score, meep }) => [ccard.colId, bcard.colBid, score, meep])
    const sc5 = scoress.map(({ ccard, bcard, score, meep }) => [ccard.colId, bcard.colBid, score, meep])
    const ndxs = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3], len = ndxs.length;
    if (scoress.length < 3) debugger;
    let ndx = 0;
    const { ccard, bcard, score, meep } = (slen >= 1)
      ? scores0[ndx = Random.random(scores0.length)]
      : scoress[ndx = permute(ndxs)[Random.random(len)]];
    // const { ccard, bcard } = (slen >= 1) ? scores0[ndx] : scoress[ndx]
    // const colCard = this.colSelButtons[ccard.colNum - 1]
    // const bidCard = this.colBidButtons[bcard.colBid - 1]
    const colCard = this.colSelButtons.find(b => b.colNum == ccard.colNum) as ColSelButton;
    const bidCard = this.colBidButtons.find(b => b.colBid == bcard.colBid) as ColBidButton;
    const plyrId = AT.ansiText(['red', 'bold'], this.Aname)
    console.log(stime(this, `.collectBid_greedy: ${plyrId} ${colCard.colId}-${bidCard.colBid}, meep=${meep}`))
    colCard.onClick({}, this)
    bidCard.onClick({}, this)
    this.gamePlay.hexMap.update()
  }
  /** pretend ccard,bcard win, and advance on col */
  pseudoWin(ccard: ColSelButton, bcard: ColBidButton) {
    const col = ccard.colNum
    const gamePlay = this.subGameSetup.gamePlay;
    const plyr = gamePlay.allPlayers[this.index];
    // save original locations:
    const allMeepsInCol = gamePlay.allMeeples.filter(meep => meep.card.col == col);
    const fromCardNdx = allMeepsInCol.map(meep => [meep, meep.card, meep.cellNdx] as [ColMeeple, ColCard, cellNdx: number])
    // player meepsInCol:
    const meepsInCol = gamePlay.meepsInCol(col, plyr);
    const meep = this.meepleToAdvance(meepsInCol);
    gamePlay.gameState.winnerMeep = meep;
    gamePlay.advanceMeeple(meep)
    const scorec = gamePlay.scoreForColor(meep, undefined, false)
    const pRank = (fromCardNdx.find(([smeep]) => smeep == meep) as [ColMeeple, ColCard, number])[1].rank;
    const rank = meep.card.rank, maxRank = gamePlay.nRows;
    const score = scorec + (TP.onePerRank ? 0 : (rank < maxRank) ? (rank - pRank) : 0);  // boost for rank, maybe also delta-rank
    fromCardNdx.sort(([am, ac], [bm, bc]) => ac.rank - bc.rank); // increasing rank (for up-bumps)
    fromCardNdx.forEach(([meep, card, ndx]) => card.addMeep(meep, ndx)); // back to original slots
    return score
  }
  scoreLayout() {

  }

  override bumpMeeple(meep: ColMeeple, dir0?: (0 | 1 | -1 | -2), cb?: () => void) {
    return super.bumpMeeple(meep, dir0 ?? 1)
  }
}
