import { json, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib, type SetupElt } from "@thegraid/hexlib";
import { CB, ColSelButton, type ColId } from "./card-button";
import type { BlackCard, ColCard, DualCard } from "./col-card";
import { type ColMeeple } from "./col-meeple";
import type { ColTable } from "./col-table";
import type { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import { RectTopoEWC, type HexMap2 } from "./ortho-hex";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { TP } from "./table-params";

/** 0: Black, 1: r, 2: g, 3: b, 4: v, 5: white */ // white: for blank cards
export type Faction =  (0 | 1 | 2 | 3 | 4 | 5);
export const nFacs = 4;

// TODO: 4-color card for dead-end spots
// TODO: early black: prefer col-E
// TODO:


// Player tells game a specific BumpDir;
// Game tells Player simple up/dn BumpDir0;
// then Player consults map/usePyrTopo and returns a BumpDir
export const BD_N = 'N' as BumpDirC & AdvDir;
export const BD_S = 'S' as BumpDirC & BumpDn;
export const BD_SS = 'SS' as BumpDn2;
// TODO; constants & types for player.pyrChoices[]
export type BumpDirC = ('S' | 'N');       // Column dirs
export type BumpDirA = ('SS' | BumpDirC)  // bumpDir choice to winner -> BumpDir2
export type BumpDirP = ('SW' | 'SE' | 'NW' | 'NE'); // Pyramid dirs; length == 2
export type AdvDir   = ('N' | 'NW' | 'NE'); // dirs to Advance or BumpUp
export type BumpUp   = ('N' | 'NW' | 'NE'); // dirs to Advance or BumpUp
export type BumpDn2  = ('SS') // double down from winner
export type BumpDn  = ('S' | 'SW' | 'SE') // single down cascaded
/** any single dir, including winner's double-down bump (SS)*/
export type BumpDir2 = (BumpDirC | BumpDirP | BumpDn2); // from winner choice
/** single (cascade) bump: up or down */
export type BumpDir = BumpDirC | BumpDirP; // cascDir from bumpee choice
export type CB_Step<T extends AdvDir | BumpDir2> = (step: Step<T>) => void;
/**
 * Where we were before we dropped meep in its current meep.card, card.cellNdx.
 *
 * AdvStep <BumpDir1> or Bump2Step<BumpDir2> or Bump1Step<BumpDir0|BumpDirP>
 */
export interface Step<T extends AdvDir | BumpDir2> {
  meep: ColMeeple;   // meep has moved to meep.{card, cellNdx}
  fromCard: ColCard; // where meeple started
  dir: T;            // fromCard -> meep.crd
  ndx: number;       // started fromCard.ndx
  stayee?: ColMeeple;// other meeple, not bumped
  meepStr?: string;  // showing meep location at this point
}
/** returns an Array filled with n Elements: [0 .. n-1] or [dn .. dn+n-1] or [f(0) .. f(n-1)] */
export function arrayN(n: number, nf: number | ((i: number) => number) = 0) {
  const fi = (typeof nf === 'number') ? (i: number) => (i + nf) : nf;
  return Array.from(Array(n), (_, i) => fi(i))
}

export type CardContent = { fac: Faction[], meeps?: string[] };
export class GamePlay extends GamePlayLib {
  /** row0 at the top */
  black0: ColCard[] = [];
  /** rowN = rank0 at the bottom */
  blackN: BlackCard[] = [];
  allCols: ColCard[] = [];
  allDuals: DualCard[] = [];
  allBlack: BlackCard[] = [];

  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
    this.nCols = TP.mHexes;
    this.nRows = TP.nHexes;
  }

  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap2;
  declare table: ColTable;
  override get allMeeples(): ColMeeple[] { return super.allMeeples as ColMeeple[] }

  declare curPlayer: Player;
  override get allPlayers() { return super.allPlayers as Player[] }
  override setCurPlayer(player: Player) {
    this.curPlayer.panel.showPlayer(false);
    super.setCurPlayer(player)
    this.curPlayer.panel.showPlayer(true);
  }

  declare scenarioParser: ScenarioParser; // ReturnType<GamePlay['makeScenarioParser']>
  override makeScenarioParser(hexMap: HexMap2): ScenarioParser {
    return new ScenarioParser(hexMap, this)
  }

  topoEW6 = new RectTopoEWC(6, 1, 0);
  get mapString() {
    let indent = '';
    return arrayN(this.nRows)
      .map(row => {
        const cir = this.cardsInRow(row), c0 = cir[0].col;
        const c0x = this.topoEW6.xywh(1, row, c0).x
        indent = arrayN(c0x).map(i => ' ').join('');
        return indent + cir.map(card => card?.meepStr).join(' | ')
      })
      .concat(indent + this.cardsInRow(this.nRows - 1).map(card => `${`${card.cellsInUse.length}`.padEnd(3)}`).join(' | '))
      .join('\n ')
  }

  override get turnId() {
    return `${this.gameState.turnId}`; // turnId as string
  }

  /** all the cards and the meeples on them. ordered [row=0..nrows-1][column=0..ncols-1]
   *
   * for logWriterLine0() and parseScenario.addStateElements()
   */
  getLayout(): CardContent[][] {
    const gp = this, hexMap = gp.hexMap;
    // generate from top to bottom
    const layout = arrayN(gp.nRows).map(row =>
      gp.cardsInRow(row).map(card => {
        const fac = card.factions;
        // the second meep (on bumpLoc) appears after the '+'
        const meeps0 = card.meepsAtNdx.map(meeps => meeps.map(meep => meep?.pcid).join('+'))
        const meeps = card.meepsOnCard.length > 0 ? meeps0 : undefined;
        return ({ fac, meeps })
      })
    )
    return layout;
  }

  /** cardStates for each player:  */
  getPlayerState() {
    return this.allPlayers.map((p, i) => p.saveCardStates());
  }

  override logWriterLine0(key = 'start', line?: Record<string, any>) {
    if (line) {
      super.logWriterLine0(key, line);
      return;
    }
    const gp = this, hexMap = gp.hexMap;
    const time = stime.fs();
    const n = gp.allPlayers.length;
    const playerColors = gp.allPlayers.map(plyr => plyr.cname); // canonical color
    const turn = Math.max(0, gp.turnNumber);
    const tableElts = gp.table.saveState();
    const layout = this.getLayout()
    line = {
      turn, n, time, playerColors, ...tableElts, layout,
    }

    const line00 = json(line, true); // machine readable starting conditions
    const line01 = line00.replace(/\],(layout)/g, '],\n$1')
    const line02 = line01.replace(/\],(\[)/g, '],\n        $1')
    const line03 = line02.replace(/^{/, '{ ')
    const line0 = line03.replace(/}$/, '\n}')
    console.log(stime(this, `.logWriterLine0: --------------------\n ${line0}`))
    this.logWriter?.writeLine(`{${key}: ${line0}},`)
  }
  override logNextPlayer(from: string): void {  } // no log
  override isEndOfGame(): boolean {
    const plyrs = this.allPlayers, max = this.table.scoreTrack.maxValue;
    const r0cards = this.cardsInRow(0)
    // end if any player has both markers on slot 54:
    const win1 = plyrs.find(plyr => !plyr.scoreCounters.find(mrkr => mrkr.value < max));
    if (win1) return true;
    // end if each top-black is occupied
    const win2 = !r0cards.find(card => card.meepsOnCard.length == 0)
    if (win2) return true;
    //  end if one top-Black has all players
    const win3 = r0cards.find(card => !plyrs.find(plyr => !card.meepsOnCard.find(meep => meep.player == plyr)))
    if (win3) return true;
    return false;
  }
  /** return false for col==3 with BlackNull; see also: colIdsInPlay */
  cardInRow0(col: number) {
    const row0_card = this.hexMap.getCard(this.nRows - 1, col)
    return (row0_card) // if (BlackNull) return true, col = 6 returns false;
  }

  winningBidder(colId: ColId) {
    const bidsOnCol = this.allPlayers.map(plyr => plyr.bidOnCol(colId));
    const plyrBids = bidsOnCol.filter(pbid => pbid !== undefined);
    plyrBids.sort((a, b) => b.bid - a.bid); // descending order of bid
    do {
      const bid = plyrBids[0]?.bid; // the highest bid value
      if (bid === undefined) return undefined;
      const nbids = plyrBids.filter(pb => pb.bid == bid).length // others with same bid
      if (nbids === 1) {
        const winner = plyrBids.shift()?.plyr;  // exactly 1 --> winner
        plyrBids.forEach(pb => pb.plyr.outBid(colId, bid))
        return winner
      }
      const cancels = plyrBids.splice(0, nbids); // remove all equal bids
      cancels.forEach(pb => pb.plyr.cancelBid(colId, bid))
    } while (true)
  }

  movePhases = ['BumpAndCascade', 'BumpFromAdvance', 'ResolveWinner'];
  get isMovePhase() {
    return this.movePhases.includes(this.gameState.state.Aname!)
  }
  /** interpose on addMeep for official moves; so we can track/log/verify */
  moveMeep(meep: ColMeeple, card: ColCard, ndx = 0) {
    this.recordMeep(meep); // before moving: record original card & cellNdx
    const toBump = card.addMeep(meep, ndx);
    this.meepsToMove = toBump ? [meep, toBump] : [];
    return toBump;
  }
  _meepsToMove: ColMeeple[] = []; // [meep, toBump]
  get meepsToMove() { return this._meepsToMove }
  set meepsToMove(meeps: ColMeeple[]) {
    this._meepsToMove.forEach(m => m.highlight(false, false))
    this._meepsToMove = meeps;
    this._meepsToMove.forEach(m => m.highlight(true, false))
    this.gameSetup.stage.update();
  }
  /** Player move meeps manually */
  cb_moveMeeps?: (step: Step<AdvDir> | Step<BumpDir2>) => boolean;

  /**
   * Determine winningBidder (if any), select meep to advance, gp.moveMeep(card, ndx)
   *
   * gamePlay will respond with selectNdx_BumpDir
   *
   * callback to gameState -> meepsInCol [scoreForColor]
   *
   * @param col column [1..nCols] supplied by gameState
   * @param cb_advanceMeeple callback when winningBidder has selected a meep, dir & ndx to advance.
   */
  resolveWinnerAndAdvance(colId: ColId, cb_advanceMeeple: (step?: Step<AdvDir>) => void) {
    const plyr =  this.winningBidder(colId);
    if (plyr) {
      this.setCurPlayer(plyr); // so we know plyr.useRobo
      const meepsInCol = this.meepsInCol(colId, plyr);
      this.meepsToMove = meepsInCol;
      // in pyramid games, is possible to bid & win a column where you have no meeps!
      if (meepsInCol.length > 0) {
        return plyr.advanceOneMeeple(meepsInCol, cb_advanceMeeple); // invoke callback
      }
    }
    cb_advanceMeeple(undefined); // no meep to advance
    return
  }

  /**
   *
   * @param colId
   * @param player
   * @returns meeples of Player in column, suitable for winner.meep
   */
  meepsInCol(colId: ColId, player: Player) {
    // cannot advance in another column (allowed to 'advance' from row == 0)
    return player.meeples.filter(meep => meep.card.isInCol[colId]);
    // TODO: alternative for Pyramid
  }
  /** set by Player.manuMoveMeeps(,dirA,) */
  dragDirs: BumpDir2[] = [];
  cascadeDir(bumpDir?: BumpDir2) {
    return bumpDir ? this.cascDir = (bumpDir.startsWith('S') ? 'S' : 'N') : this.cascDir!;
  }
  /** utility: meep & other in same cell after Advance */
  dirsForBumpAdv(meep: ColMeeple, other: ColMeeple) {
    return ((meep.player == other.player) || (meep.card.hex.row == 1) ? ['N'] : ['SS', 'S']) as BumpDirA[];
  }
  /** utility to compute valid cellNdxs for advance */
  cellsForAdvance(advCard: ColCard) {
    // assert bumpDir starts with 'N', must use open cell if available.
    const nCells = advCard.maxCells, open = advCard.openCells, nOpen = open.length;
    return (nCells > 2) ? [0] : (nOpen == 1) ? open : arrayN(nCells);
  }
  /** utility to compute valid cells for bumpee to use */
  cellsForBumpee(nextCard: ColCard, bumpDir = 'S') {
    const nCells = nextCard.maxCells, open = nextCard.openCells, nOpen = open.length;
    const ndxs = (nCells > 2) ? [0] : (nOpen == 1 && bumpDir.startsWith('N')) ? open : arrayN(nCells);
    return { card: nextCard, ndxs }
  }
  /** utility to compute valid initial BumpDirA */
  dirsForBumpDir(meep: ColMeeple, advCard: ColCard) {
    const mustBumpUp = (TP.bumpUpRow1 && (advCard.hex.row == 1)) || this.mustBumpSelf(meep, advCard);
    return (mustBumpUp ? ['N'] : TP.allBumpsDown ? ['SS', 'S'] : ['SS', 'S', 'N']) as BumpDirA[];
  }
  /** if meep advances to nextCard(dir).ndx --> bumps their own meep */
  mustBumpSelf(meep: ColMeeple, card: ColCard) {
    const meeps = card.meepsOnCard, player = meep.player;
    return (meeps.length == card.maxCells && !meeps.find(m => m.player !== player))
  }

  recordStack: ReturnType<GamePlay['recordMeep0']>[][] = [];
  origMeepCardNdxs: ReturnType<GamePlay['recordMeep0']>[] = []; // <-- becomes recordStack[0]
  recordMeep0(meep: ColMeeple) {
    const card = meep.card, ndx = meep.cellNdx!;
    return { meep, card, ndx }
  }
  recordMeep(meep: ColMeeple) {
    if (this.origMeepCardNdxs && !this.origMeepCardNdxs.find(mcn => mcn.meep == meep)) {
      this.origMeepCardNdxs.unshift(this.recordMeep0(meep))
    }
    return meep;
  }
  /** start a new list of meeple locations
   * @param push [true] push a layer; false -> flush and reset
   */
  recordMeeps(push = true) {
    if (push) {
      this.recordStack.push(this.origMeepCardNdxs)
      if (this.recordStack.length > 18) debugger;
    } else {
      this.recordStack = []; // reset
    }
    const prev = this.recordStack[this.recordStack.length-1]; // debug logpoint
    this.origMeepCardNdxs = []; // new stack
    return
  }
  restoreMeeps() {
    const meeps = this.origMeepCardNdxs; // the current record
    meeps.forEach(mcn => mcn.card.addMeep(mcn.meep, mcn.ndx))
    meeps.forEach(mcn => { if (!mcn.card.hex) debugger; })
    this.origMeepCardNdxs = this.recordStack.pop()!; // the previous record
    if (!this.origMeepCardNdxs) debugger;
  }

  /** bumpUp or bumpDn2 */
  bumpAfterAdvance(meep: ColMeeple, other: ColMeeple, cb_bumpAdvance?: CB_Step<BumpDir2>): Step<BumpDir2> | undefined {
    const dirs = this.dirsForBumpAdv(meep, other);
    const cascDir = this.cascadeDir(dirs[0])
    const plyr = meep.player;
    console.log(stime(this, `.bumpAfterAdvance(${meep.toString()} ${other.toString()} cascDir=${cascDir})`))
    const step = (cascDir == BD_N)
      ? plyr.bumpUp(meep, other, cb_bumpAdvance)
      : plyr.bumpDn2(other, undefined, (step: Step<BumpDir2>) => {
        this.meeplesToCell([meep]);
        cb_bumpAdvance?.(step);
      })
    return step;
  }
  /** signal all bumps from this advance are cascDir */
  cascDir?: BumpDirC;

  // assert that Player returns a BumpDir that hits a nextCard!
  /** meep has moved to (card0, ndx); any bump goes to bumpDir [supplied by winner or previous bumpee]
   *
   * Check for toBump, recurse until no more toBump.
   * @param meep has been moved to current loc; check for collision and bump
   * @param other otherMeepInCell with meep (if any)
   * @param bumpDone callback(bumpees) when cascade of bumps has stopped
   * @param depth
   */
  bumpAndCascade(meep: ColMeeple, other = meep.card.otherMeepInCell(meep), bumpDone?: () => void, depth = 0) {
    this.setCurPlayer(meep.player); // light up the PlayerPanel
    const cascDir = this.cascadeDir()
    console.log(stime(this, `.bumpAndCascade ->(${meep.toString()} ${other?.toString()} cascDir=${cascDir})`))
    if (!!other) {
      const step = meep.player.bumpInCascade(meep, other, cascDir, bumpDone)
      if (!step) return;  // manual mode returns undefined, will call bumpDone
      const bumpee = step.meep, stayee = step.stayee;
      if (stayee) {
        // stayee stops moving, settle into place. bumpee is already moved to its new cell
        if (this.meeplesToCell([stayee])) debugger;  // bumpee should be gone...
      }
      // auto-mode returns the next Step<BumpDir>, expects a new call to plyr.bumpInCascade
      this.bumpAndCascade(bumpee, undefined, bumpDone, depth + 1);
      return;
    } else {
      bumpDone && bumpDone();
    }
  }

  override parseScenario(scenario: SetupElt): void {
    super.parseScenario(scenario)
    this.setCardIsInCol();
  }

  cardsInRow(row: number, andBlack = true) {
    // arrayN(this.nCols, 1).map(col => this.hexMap.getCard(this.nRows - 1 - row, col))
    // TODO: use nextCard('E') ??
    const [nr, nc] = this.hexMap.nRowCol
    const hexRow = this.hexMap[row];
    return hexRow.map(hex => hex?.card).filter(card => (card !== undefined) && (andBlack || (card.maxCells != 0)));
  }
  /**
   * cards with .isInCol(colId)
   * @param colId
   * @param andBlack include top & bottom rows (other blacks always included)
   * @returns
   */
  cardsInCol(colId: ColId, andBlack = true) {
    const [rn, ro] = andBlack ? [0, 0] : [2, 1]; // also snip BlackNull('Null:3')
    return arrayN(this.nRows - rn, ro)
      .map(row => this.cardsInRow(row)
        .filter(card => card.isInCol[colId] && (andBlack || (card.maxCells != 0)))).flat();
    // Note: (maxCells == 0) for unplayable BlackNull on bottom row.
  }

  get colIdsInPlay() {
    // black cards have maxCells = (inPlay) ? 2*np : 0 (not in play)
    return this.blackN.filter(bc => bc.maxCells > 0).map(card => [card.colId, card.x] as [colId: ColId, x: number])
  }

  /** on each Hex[row, col] test & set Card.isInCol() */
  setCardIsInCol() {
    const colIdsInPlay = this.colIdsInPlay;
    this.hexMap.forEachHex(hex => {
      const w = hex.xywh0.dxdc * .9 * (TP.usePyrTopo ? 1 : 1 )
      const card = hex.card;
      colIdsInPlay.map(([colId, x]) => card.isInCol[colId] = Math.abs(card.x - x) <= w);
      if (!colIdsInPlay.find(([id, x]) => card.isInCol[id])) card.isDead = true;
    })
  }

  // TOOO: cache the set of cards for a given col (& row); they never move.
  cardsInColId(colId: ColId, andBlack = true) {
    const cards = [] as ColCard[];
    this.hexMap.forEachHex(hex => {
      const card = hex.card, isBlack = (card.maxCells == 0) || (card.maxCells > 2);
      if (hex.card.isInCol[colId] && (andBlack ? true : !isBlack)) cards.push(hex.card)
    })
    return cards;
  }

  /** move meeple from bumpLoc to center of cell;
   * Expect cell is unoccupied; but maybe not for manu moves?
   * @param bumpees the meeps [bumpee, stayee] that were movable (may be some undef's)
   * @returns a meep to BumpInCascade
   */
  meeplesToCell(bumpees: ColMeeple[]) {
    const bumps = bumpees.filter(meep => {
      meep?.highlight(false);
      return meep?.card.addMeep(meep, meep.cellNdx)
    });
    return bumps[0];
  }

  /** EndOfTurn: score for color to meep.player; and advanceMarker(score) */
  scoreForColor(meep: ColMeeple | undefined, cb?: () => void, advMrk = true): [score: number, str: string] {
    if (!meep) { cb && cb(); return [0, '!meep'] };
    const faction = meep.faction as Faction; // by now, meeplesOnCard has resolved.
    const player = meep.player;
    const bidCard = player.colBidButtons.find(cbb => cbb.state == CB.selected);
    if (TP.bidReqd && !bidCard?.factions.includes(faction)) { cb && cb(); return [0, 'noBid'] };
    const colScore = player.meeples.filter(meep => (meep.faction == faction)).length;
    const cardScore = player.colBidButtons.filter(b => (b.state !== CB.clear) && b.factions.includes(faction)).length
    const trackScore = this.table.scoreTrack.markers[player.index].filter(m => m.faction == faction).length;
    const score = colScore + cardScore + trackScore
    const scoreStr = `${player.Aname}: ${colScore}+${cardScore}+${trackScore} = ${score}`;
    const tlog = TP.logFromSubGame || this.table.stage.canvas
    const anno = (this.table.stage.canvas) ? '' : 'R ';
    tlog && this.logText(scoreStr, `${anno}scoreForColor[${faction}]-${meep.toString()}`)
    if (advMrk) player.advanceMarker(score, [], cb)
    return [score, scoreStr];
  }

  /** for each row (0 .. nRows-1 = top to bottom) player score in order left->right */
  scoreForRank() {
    const nRows = this.nRows, nScored = arrayN(this.allPlayers.length, i => 0)
    // include top row (so ndx == row), but score = 0;
    const playersInRow = arrayN(nRows - 1).map(row =>
      this.cardsInRow(row, false).map(card => card.meepsOnCard.map(meep => meep.player))
        .flat().filter((plyr, n, ary) => !ary.slice(0, n).find(lp => lp == plyr))
      // retain first occurence of player on row
    )

    /** score for presence of player on the given row */
    const scoreForRow = (plyr: Player, row: number) => {
      const meeps = this.cardsInRow(row)
        .map(card => card.meepsOnCard
          .filter(meep => meep.player == plyr)).flat()
      const rank = this.nRows - 1 - row;
      const nMeep0 = meeps.length;
      const nMeep1 = (TP.onePerRank ? Math.min(1, nMeep0) : nMeep0)
      const nMeeps = Math.min(nMeep1, Math.max(0, TP.nTopMeeps - nScored[plyr.index]));
      const scored = nScored[plyr.index] > 0;
      const score = (row == 0 ? 0 : rank) * nMeeps;
      if (score > 0) nScored[plyr.index] += nMeeps;  // number of meeps this player has scored
      return (TP.topRankOnly && scored) ? 0 : score;
    }
    return playersInRow.map((plyrsInRow, row) =>
      plyrsInRow.map(plyr =>
        ({ plyr, score: scoreForRow(plyr, row) }))
    )
  }

  brake = false; // for debugger
  /** for conditional breakpoints while dragging; inject into any object. */
  toggleBrake() {
    const brake = (this.brake = !this.brake);
    ;(this.table as any)['brake'] = brake;
    ;(this.hexMap.mapCont.markCont as any)['brake'] = brake;
    console.log(stime(this, `.toggleBreak:`), brake)
  }

  override bindKeys(): void {
    super.bindKeys();
    const table = this.table;
    KeyBinder.keyBinder.setKey('M-s', () => this.showGameSave());
    KeyBinder.keyBinder.setKey('C-d', () => this.toggleBrake());
    KeyBinder.keyBinder.setKey('M-c', () => {
      const tp=TP, tpl=TPLib
      const scale = TP.cacheTiles
      table.reCacheTiles()}
    )
  }
}
