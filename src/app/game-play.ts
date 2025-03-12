import { json, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib, type SetupElt } from "@thegraid/hexlib";
import { CB, type ColId } from "./card-button";
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
export type BumpDir = ('SS' | 'S' | 'N')

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
  blackN: ColCard[] = [];
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

  topoEW = new RectTopoEWC(6, 1, 0);
  get mapString() {
    let indent = '';
    return arrayN(this.nRows)
      .map(row => {
        const cir = this.cardsInRow(row), c0 = cir[0].col;
        const c0x = this.topoEW.xywh(1, row, c0).x
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
        const meeps0 = card.meepsAtNdx.map(meep => meep ? meep.pcid : '')
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
  winningBidder(col: number) {
    const bidsOnCol = this.allPlayers.map(plyr => plyr.bidOnCol(col));
    const plyrBids = bidsOnCol.filter(pbid => pbid !== undefined);
    plyrBids.sort((a, b) => b.bid - a.bid); // descending order of bid
    do {
      const bid = plyrBids[0]?.bid; // the highest bid value
      if (bid === undefined) return undefined;
      const nbids = plyrBids.filter(pb => pb.bid == bid).length // others with same bid
      if (nbids === 1) {
        const winner = plyrBids.shift()?.plyr;  // exactly 1 --> winner
        plyrBids.forEach(pb => pb.plyr.outBid(col, bid))
        return winner
      }
      const cancels = plyrBids.splice(0, nbids); // remove all equal bids
      cancels.forEach(pb => pb.plyr.cancelBid(col, bid))
    } while (true)
  }

  colToMove = 0;

  /**
   * Determine winingBidder (if any) and select meeple to advance.
   * @param col column [1..nCols] supplied by gameState
   * @param colMeep callback when winningBidder has selected a meep to advance.
   */
  resolveWinner(col: number, colMeep: (meep?: ColMeeple) => void) {
    this.colToMove = col;
    const plyr = this.winningBidder(col);
    if (plyr) {
      const meepsInCol = this.meepsInCol(col, plyr);
      // in pyramid games, is possible to bid & win a column where you have no meeps!
      if (meepsInCol.length > 1) {
        plyr.meepleToAdvance(meepsInCol, colMeep); // will eventually invoke colMeep()
      } else {
        colMeep(meepsInCol[0]) //---> single candidate: use {meepsInCol[0]?.toString()}
      }
      return
    }
    colMeep(undefined);
    return
  }

  /**
   *
   * @param col
   * @param player
   * @returns meeples of Player in column, suitable for winner.meep
   */
  meepsInCol(col: number, player: Player) {
    // cannot advance in another column (allowed to 'advance' from row == 0)
    return player.meeples.filter(meep => meep.card.col == col);
    // TODO: alternative for Pyramid
  }


  /**
   * Advance (dir = 1); then bump & cascade.
   * @param meep
   * @param cb callback when bump & cascade is complete
   * @returns bumpDir used for this advance
   */
  advanceMeeple(meep: ColMeeple, cb?: () => void) {
    // addMeep to next card, choose bumpDir
    const advCard = meep.card.nextCard('N'), open = advCard.openCells;
    const nCells = advCard.maxCells, nOpen = open.length;
    const ndxs = ((nCells == 2) && (nOpen != 1)) ? arrayN(nCells) : open;
    if (nCells > 2) ndxs.length = 1;  // offer single cell for Black
    const mustBumpUp = (TP.bumpUpRow1 && (advCard.hex.row == 1)) || this.mustBumpSelf(meep, advCard);
    const bumpDirs = (mustBumpUp ? ['N'] : TP.allBumpsDown ? ['SS', 'S'] : ['SS', 'S', 'N']) as BumpDir[];
    const { bumpDir: bDir, ndx } = (ndxs.length > 1)
      ? meep.player.selectNdx_BumpDir(meep, advCard, bumpDirs, ndxs)
      : { ndx: ndxs[0] ?? 0, bumpDir: bumpDirs[0] as BumpDir } // take the [first] open slot
    // enforce (bumpDir = 1) when target cell contains same player's meep:
    const bumpDir = (advCard.meepsAtNdx[ndx]?.player == meep.player) ? 'N' : bDir;
    this.advanceAndBump(meep, advCard, ndx, bumpDir)
    if (cb) cb();   // only for the original, outer-most, winning-bidder
    return bumpDir; // when called by pseudoWin()
  }
  /** if meep advances to nextCard(dir).ndx --> bumps their own meep */
  mustBumpSelf(meep: ColMeeple, card: ColCard) {
    const meeps = card.meepsOnCard, player = meep.player;
    return (meeps.length == card.maxCells && !meeps.find(m => m.player !== player))
  }

  origMeepCardNdxs?: ReturnType<GamePlay['recordMeep0']>[];
  recordMeep0(meep: ColMeeple) {
    const card = meep.card, ndx = meep.cellNdx;
    return { meep, card, ndx }
  }
  recordMeep(meep: ColMeeple) {
    if (this.origMeepCardNdxs && !this.origMeepCardNdxs.find(mcn => mcn.meep == meep)) {
      this.origMeepCardNdxs.push(this.recordMeep0(meep))
    }
    return meep;
  }
  restoreMeeps(meeps = this.origMeepCardNdxs) {
    meeps?.forEach(mcn => mcn.card.addMeep(mcn.meep, mcn.ndx))
    meeps?.forEach(mcn => { if (!mcn.card.hex) debugger; })
  }

  /** add meep to (card,ndx); any bump goes to bumpDir */
  advanceAndBump(meep: ColMeeple, card: ColCard, ndx: number, bumpDir: BumpDir, depth = 0) {
    if (depth > this.nRows) debugger;
    const toBump = card.addMeep(meep, ndx)
    if (!!toBump) {
      const nextCard = card.nextCard(bumpDir)
      const cascDir = (bumpDir == 'SS') ? 'S' : bumpDir;
      const [bumpee, ndx] = meep.player.chooseBumpee_Ndx(meep, toBump, cascDir);
      this.recordMeep(bumpee); // before bumping record original card & cellNdx
      this.advanceAndBump(bumpee, nextCard, ndx, cascDir, depth + 1);
    }
  }

  override parseScenario(scenario: SetupElt): void {
    super.parseScenario(scenario)
    this.labelCardCols();
  }

  cardsInRow(row: number) {
    // arrayN(this.nCols, 1).map(col => this.hexMap.getCard(this.nRows - 1 - row, col))
    // TODO: use nextCard('E') ??
    const [nr, nc] = this.hexMap.nRowCol
    const hexRow = this.hexMap[row];
    return hexRow.map(hex => hex?.card).filter(card => card !== undefined);
  }
  // TODO: think what this means for Pyramid
  cardsInCol(col: number, andBlack = true) {
    const [rn, ro] = andBlack ? [0, 0] : [2, 1];
    return arrayN(this.nRows - rn, ro).map(row => this.hexMap[row][col]?.card)
      .filter(card => card !== undefined);
  }
  colIdsInPlay = ['A', 'B', 'C', 'D'] as ColId[]
  // for each card on map, set card.isInCol[colId]: boolean
  labelCardCols() {
    this.hexMap.forEachHex(hex => {
      const card = hex.card;
      this.colIdsInPlay.map(colId => card.isInCol[colId] = this.isCardInCol(card, colId));
    })
  }
  /** test & set for Card on each Hex[row, col] */
  isCardInCol(card: ColCard, colId: ColId) {
    // reference col for bottom card with colId:
    const rowN = this.nRows - 1;
    const col0 = this.hexMap[rowN].find(hex => hex?.card.colId == colId)?.col;
    if (!col0) { debugger; return false }
    const col0x = this.topoEW.xywh(1, rowN, col0).x;
    const cardx = this.topoEW.xywh(1, card.hex.row, card.hex.col).x;
    return Math.abs(cardx - col0x) <= (TP.usePyrTopo ? 1 : 0);
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
   * @returns a meep that needs to bump.
   */
  meeplesToCell(col: number) {
    const cards = this.cardsInCol(col, false); // Black doesn't use bumpLoc
    const meeps = cards.map(card => card.atBumpLoc()).filter(meep => !!meep)
    const bumps = meeps.filter(meep => meep.card.addMeep(meep)); // re-center
    return bumps[0]
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
      this.cardsInRow(row).map(card => card.meepsOnCard.map(meep => meep.player))
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
