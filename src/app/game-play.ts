import { json, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib } from "@thegraid/hexlib";
import { CB, ColMeeple } from "./col-meeple";
import type { ColTable } from "./col-table";
import { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { HexMap2 } from "./ortho-hex";
import { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { TP } from "./table-params";

/** 0: Black, 1: r, 2: g, 3: b, 4: v, 5: white */ // white: for blank cards
export type Faction =  (0 | 1 | 2 | 3 | 4 | 5);
export const nFacs = 4;

/** returns an Array filled with n Elements: [0 .. n-1] or [dn .. dn+n-1] or [f(0) .. f(n-1)] */
export function arrayN(n: number, nf: number | ((i: number) => number) = 0) {
  const fi = (typeof nf === 'number') ? (i: number) => (i + nf) : nf;
  return Array.from(Array(n), (_, i) => fi(i))
}

export type CardContent = { fac: Faction[], meeps?: number[] };
export class GamePlay extends GamePlayLib {
  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
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

  get mapString() {
    return arrayN(this.nRows)
      .map(row => this.cardsInRow(row).map(card => card.meepStr).join(' | '))
      .join('\n ')
  }

  /** all the cards and the meeples on them. ordered [row=0..nrows-1][column=0..ncols-1] */
  getLayout(): CardContent[][] {
    const gp = this, hexMap = gp.hexMap;
    // generate from bottom to top, the reverse to get them top to bottom:
    const layout = arrayN(gp.nRows).map(rank =>
      arrayN(gp.nCols, 1).map(col => {
        const card = hexMap.getCard(rank, col);
        const fac = card.factions;
        const meeps0 = card.meepsOnCard.map(meep => meep.player.index)
        const meeps = meeps0.length > 0 ? meeps0 : undefined;
        return ({ fac, meeps })
      })
    ).reverse()
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
    // colorName shows in player.Aname:
    const playerColors = gp.allPlayers.map(plyr => Player.colorName(plyr.color)); // canonical color
    const turn = Math.max(0, gp.turnNumber);
    const tableElts = gp.table.saveState();
    const layout = this.getLayout()
    line = {
      turn, n, time, playerColors, ...tableElts, layout,
    }

    const line00 = json(line, true); // machine readable starting conditions
    const line01 = line00.replace(/\],(layout)/g, '],\n$1')
    const line02 = line01.replace(/\],(\[)/g, '],\n        $1')
    const line03 = line02.replace(/^{/, '{\n')
    const line0 = line03.replace(/}$/, '\n}')
    console.log(`-------------------- ${line0}`)
    this.logWriter.writeLine(`{${key}: ${line0}},`)
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
    const meepsInCol = this.meepsInCol(col, plyr);
    if (plyr && meepsInCol.length > 0) {
      plyr.meepleToAdvance(meepsInCol, colMeep); // will eventually invoke colMeep()
    } else {
      colMeep(undefined);
    }
  }

  /**
   *
   * @param col
   * @param player
   * @returns meeples of Player in column, suitable for winner.meep
   */
  meepsInCol(col: number, player?: Player) {
    // cannot advance meep in top row (or in other column)
    const rv = player?.meeples.filter(meep => meep.card.col == col && meep.card.rank < this.nRows) ?? [];
    return rv;
    // TODO: alternative for Pyramid
  }


  /**
   * advance (dir = 0); then bump & cascade.
   * @param meep
   * @param cb callback when bump & cascade is complete
   */
  advanceMeeple(meep: ColMeeple, cb?: () => void) {
    // addMeep to next card, choose bumpDir
    const card = meep.card.nextCard(1), nCells = card.factions.length;
    const open = card.openCells, nOpen = open.length;
    const { bumpDir, ndx } = (nCells == 2) && (nOpen == 2 || nOpen == 0)
      ? meep.player.chooseCellForAdvance(meep, card)
      : { ndx: open[0], bumpDir: 1 as 1 | -1 } // take the [first] open slot
    const toBump = card.addMeep(meep, ndx)
    if (toBump) {
      const [bumpee, ndx] = meep.player.chooseMeep_Cell(meep, bumpDir);
      this.bumpAndCascade(bumpee, bumpDir, ndx);
    }
    if (cb) cb(); // only for the original, outer-most, winning-bidder
    return bumpDir; // when called by pseudoWin()
  }

  bumpAndCascade(meep: ColMeeple, bumpDir: 1 | -1 | -2, ndx: number, depth = 0) {
    const cascadeDir = (bumpDir == -2) ? -1 : bumpDir;
    if (depth > this.nRows) debugger;
    const card = meep.card.nextCard(bumpDir);
    const toBump = card.addMeep(meep, ndx)
    if (toBump) {
      const [bumpee, ndx] = meep.player.chooseMeep_Cell(meep, cascadeDir);
      this.bumpAndCascade(bumpee, cascadeDir, ndx, depth + 1)
    }
  }

  cardsInRow(row: number) {
    // arrayN(this.nCols, 1).map(col => this.hexMap.getCard(this.nRows - 1 - row, col))
    return arrayN(this.nCols, 1).map(col => this.hexMap[row][col].card);
  }
  cardsInCol(col: number, noBlack = true) {
    const [rn, ro] = noBlack ? [2, 1] : [0, 0];
    return arrayN(this.nRows - rn, ro).map(row => this.hexMap[row][col].card);
  }

  /** move meeple from bumpLoc to center of cell;
   * @returns a meep that needs to bump.
   */
  meeplesToCell(col: number) {
    const cards = this.cardsInCol(col)
    const meeps = cards.map(card => card.atBumpLoc()).filter(meep => !!meep)
    const bumps = meeps.filter(meep => meep.card.addMeep(meep)); // re-center
    return bumps[0]
  }

  /** EndOfTurn: score for color to meep.player; and advanceMarker(score) */
  scoreForColor(meep: ColMeeple | undefined, cb?: () => void, advMrk = true): [score: number, str: string] {
    if (!meep) { cb && cb(); return [0, '!meep'] };
    const faction = meep.faction as number; // by now, meeplesOnCard has resolved.
    const player = meep.player;
    const bidCard = player.colBidButtons.find(cbb => cbb.state == CB.selected);
    if (TP.bidReqd && !bidCard?.factions.includes(faction)) { cb && cb(); return [0, 'noBid'] };
    const colScore = player.meeples.filter(meep => (meep.faction == faction)).length;
    const cardScore = player.colBidButtons.filter(b => (b.state !== CB.clear) && b.factions.includes(faction)).length
    const trackScore = this.table.scoreTrack.markers[player.index].filter(m => m.faction == faction).length;
    const score = colScore + cardScore + trackScore
    const scoreStr = `${player.Aname}: ${colScore}+${cardScore}+${trackScore} = ${score}`;
    this.logText(scoreStr, `scoreForColor[${faction}]-${meep.toString()}`)
    if (advMrk) player.advanceMarker(score, cb)
    return [score, scoreStr];
  }

  /** for each row (0 .. nRows-1 = top to bottom) player score in order left->right */
  scoreForRank() {
    const nRows = this.nRows, nCols = this.nCols, mRank = nRows - 1;
    const playersInRow = arrayN(nRows - 1).map(row =>
      this.cardsInRow(row).map(card => card.meepsOnCard.map(meep => meep.player))
        .flat().filter((plyr, n, ary) => !ary.slice(0, n).find(lp => lp == plyr))
      // retain first occurence of player on row
    )
    return playersInRow.map((plyrsInRow, row) =>
      plyrsInRow.map(plyr =>
        ({ plyr, score: this.playerScoreForRow(plyr, row) }))
    )
  }

  /** score for presence of player on the given rank */
  playerScoreForRow(plyr: Player, row: number) {
    const meeps = this.cardsInRow(row)
      .map(card => card.meepsOnCard
        .filter(meep => meep.player == plyr)).flat()
    const rank = this.nRows - 1 - row;
    return (rank == 0 ? 0 : rank) * (TP.onePerRank ? Math.min(1, meeps.length) : meeps.length);
  }

  resetPlayerCards() {
    this.allPlayers.forEach(plyr => {
      plyr.clearButtons()
    })
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
    KeyBinder.keyBinder.setKey('S-s', () => { this.saveGame() })
    KeyBinder.keyBinder.setKey('C-d', () => this.toggleBrake());
    KeyBinder.keyBinder.setKey('M-c', () => {
      const tp=TP, tpl=TPLib
      const scale = TP.cacheTiles
      table.reCacheTiles()}
    )
  }
}
