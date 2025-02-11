import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib } from "@thegraid/hexlib";
import { CB, ColMeeple } from "./col-meeple";
import type { ColTable } from "./col-table";
import { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { HexMap2 } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";

/** returns an Array filled with n Elements: [0 .. n-1] or [dn .. dn+n-1] or [f(0) .. f(n-1)] */
export function arrayN(n: number, nf: number | ((i: number) => number) = 0) {
  const fi = (typeof nf === 'number') ? (i: number) => (i + nf) : nf;
  return Array.from(Array(n), (_, i) => fi(i))
}

export class GamePlay extends GamePlayLib {
  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
  }
  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap2;
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
    const plyrs = this.allPlayers;
    // end if any player has both markers on slot 54:
    const win1 = plyrs.find(plyr => plyr.markers.find(mrkr => mrkr.value < 54));
    if (win1) return true;
    // end if each top-black is occupied
    const win2 = (!this.hexMap[0].find(hex => hex.card.meepsOnCard.length == 0))
    if (win2) return true;
    //  end if one top-Black has all players
    const win3 = !this.hexMap[0].find(hex => plyrs.find(plyr => !hex.card.meepsOnCard.find(meep => meep.player == plyr)))
    if (win3) return true;
    return false;
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

  /** move meeple from bumpLoc to center of cell */
  meeplesToCell(col: number) {
    const meeps = ColMeeple.allMeeples.filter(meep => meep.card.col == col && meep.faction !== 0)
    const bumps = meeps.filter(meep => !meep.card.addMeep(meep, meep.cellNdx)); // re-center
    return bumps[0]
  }

  /** EndOfTurn: score for color to meep.player */
  scoreForColor(meep: ColMeeple | undefined, cb: () => void) {
    if (!meep) { cb(); return 0 };
    const faction = meep.faction as number; // by now, meeplesOnCard has resolved.
    const player = meep.player;
    const bidCard = player.coinBidButtons.find(cbb => cbb.state == CB.selected);
    if (TP.bidReqd && !bidCard?.factions.includes(faction)) { cb(); return 0 };
    const colScore = player.meeples.filter(meep => (meep.faction == faction)).length;
    const cardScore = player.coinBidButtons.filter(b => (b.state !== CB.clear) && b.factions.includes(faction)).length
    const trackScore = this.table.scoreTrack.markers[player.index].filter(m => m.faction == faction).length;
    const score = colScore + cardScore + trackScore
    this.logText(`Player-${player.index}: ${colScore}+${cardScore}+${trackScore} = ${score}`, `scoreForColor[${faction}]`)
    player.advanceMarker(score, cb)
    return score;
  }

  /** for each row (0 .. nRows-1 = top to bottom) player score in order left->right */
  scoreForRow() {
    const nRows = this.nRows, nCols = this.nCols, mRank = nRows - 1;
    const playerByRow = arrayN(nRows - 1).map(row => {
      return arrayN(nCols, 0).map(col => {
        const cardRC = this.hexMap.getCard(mRank - row, col + 1);
        return cardRC.meepsOnCard.map(meep => meep.player)
      }).flat()
    })
    return playerByRow.map((plyrsOnRow, row) => {
      const rank = (row == 0) ? 0 : nRows - 1 - row;
      return plyrsOnRow.map(plyr => {
        const allPlyr0 = plyrsOnRow.filter(pf => pf == plyr)
        return { plyr: plyr, score: allPlyr0.length * rank }
      }).filter((por, n, ary) => !ary.slice(0, n).find(elt => elt.plyr == por.plyr))
    })
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
