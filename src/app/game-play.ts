import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib, type HexMap } from "@thegraid/hexlib";
import { CB, type ColMeeple } from "./col-meeple";
import type { ColTable } from "./col-table";
import { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { OrthoHex } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";


export class GamePlay extends GamePlayLib {
  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
  }
  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap<OrthoHex>
  declare table: ColTable;

  declare curPlayer: Player;
  override get allPlayers() { return super.allPlayers as Player[] }
  override setCurPlayer(player: Player) {
    this.curPlayer.panel.showPlayer(false);
    super.setCurPlayer(player)
    this.curPlayer.panel.showPlayer(true);
  }
  override logNextPlayer(from: string): void {  } // no log
  override isEndOfGame(): boolean {
    const row = 0;
    // TODO: end if one cell has all players
    if (this.allPlayers.find(plyr => plyr.score >= 100)) return true;
    return (!this.hexMap[row].find(hex => hex.card!.meepsOnCard.length < 1))
  }
  winningBidder(col: number) {
    const bidsOnCol = this.allPlayers.map(plyr => plyr.bidOnCol(col));
    const plyrBids = bidsOnCol.filter(pbid => pbid !== undefined);
    plyrBids.sort((a, b) => b.bid - a.bid); // descending order of bid
    do {
      const bid = plyrBids[0]?.bid;
      if (bid === undefined) return undefined;
      const nbids = plyrBids.filter(pb => pb.bid == bid).length
      if (nbids === 1)  return plyrBids[0].plyr;
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

  meepsInCol(col: number, player?: Player) {
    // cannot advance meep in top row (or in other column)
    const rv = player?.meeples.filter(meep => meep.card.col == col && meep.card.rank < this.nRows) ?? [];
    return rv;
    // TODO: alternative for Pyramid
  }

  /** EndOfTurn: score for color to meep.player */
  scoreForColor(meep: ColMeeple | undefined, cb: () => void) {
    if (!meep) return;
    const faction = meep.faction;
    const player = meep.player;
    const colScore = player.meeples.filter(meep => (meep.faction == faction)).length;
    const cardScore = player.coinBidButtons.filter(b => (b.state !== CB.clear) && b.factions.includes(faction)).length
    const trackScore = this.table.scoreTrack.markers[player.index].filter(m => m.faction == faction).length;
    const score = colScore + cardScore + trackScore
    player.advanceCounter(score, cb)
    player.score += score;
    return score;
    //  TODO: include color matches from score counters
  }

  /** advance each player's score by the rank of each meeple; TODO: player chooses counter */
  /** for each player their score for each rank */
  scoreForRank() {
    return this.allPlayers.map(plyr => {
      const meeps = plyr.meeples;
      const rankScores: number[] = [], top = this.nRows - 1;
      for (let rank = 1; rank < top; rank++) {
        const nOfRank = meeps.filter(meep => meep.card.rank == rank).length;
        rankScores.push(nOfRank * rank);
      }
      return rankScores;
    })
  }
  /** EndOfRound: score for rank  */
  advanceCounters(rankScores: number[][]){
    rankScores.forEach((plyrScores, ndx) => {
      plyrScores.forEach(score => this.allPlayers[ndx].score += score);
    })
    this.gameState.done();
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
    KeyBinder.keyBinder.setKey('C-d', () => this.toggleBrake());
    KeyBinder.keyBinder.setKey('M-c', () => {
      const tp=TP, tpl=TPLib
      const scale = TP.cacheTiles
      table.reCacheTiles()}
    )   // TODO: also recache afhex!
    // KeyBinder.keyBinder.setKey('p', () => table.gamePlay.gameSetup.placeCardsOnMap())   // TODO: also recache afhex!
    // KeyBinder.keyBinder.setKey('P', () => table.gamePlay.gameSetup.placeCardsOnMap())   // TODO: also recache afhex!
  }
}
