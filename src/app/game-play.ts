import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib, type HexMap } from "@thegraid/hexlib";
import type { ColTable } from "./col-table";
import { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { OrthoHex } from "./ortho-hex";
import type { ColMeeple, Player } from "./player";
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

  override isEndOfGame(): boolean {
    if (this.turnNumber > 9) return true; // temporary stand-in until scoring done.
    return false;
  }
  winningBidder(col: number) {
    const colPlayers = this.allPlayers.filter(plyr => plyr.colSelButtons[col]?.state == true);
    const plyrBids = colPlayers.map(plyr => ({ pid: plyr?.index, plyr, bid: plyr.currentBid(col) as number }))
    plyrBids.sort((a, b) => b.bid - a.bid); // descending order of bid
    do {
      const bid = plyrBids[0]?.bid;
      if (bid === undefined) return undefined;
      const nbids = plyrBids.filter(pb => pb.bid == bid).length
      if (nbids === 1)  return plyrBids[0].plyr;
      if (nbids > 1) plyrBids.splice(0, nbids); // remove all equal bids
    } while (true)
  }

  colToMove = 0;
  // resolve winning bid for col, select meeple to advance in col
  resolveWinner(col: number, colMeep: (meep?: ColMeeple) => void) {
    this.colToMove = col;
    const plyr = this.winningBidder(col);
    let meepsInCol: ColMeeple[];
    if (plyr && (meepsInCol = this.meepsInCol(col, plyr)).length > 0) {
      plyr.meepleToAdvance(meepsInCol, colMeep); // will eventually invoke colMeep()
    } else {
      setTimeout(() => colMeep(undefined), 0);
    }
  }

  meepsInCol(col: number, player: Player) {
    // cannot advance meep in top row (or in other column)
    const rv = player.meeples.filter(meep => meep.card.hex.col == col && meep.card.rank < this.nRows)
    return rv;
    // TODO: alternative for Pyramid
  }

  /** score colors for meep.player */
  scoreForColor(meep?: ColMeeple) {
    if (!meep) return;
    const faction = meep.faction;
    const player = meep.player;
    let score = 0;
    player.meeples.forEach(meep => {
      if (meep.faction == faction) score++;
    })
    // previous bids (state == false), current bid
    player.coinBidButtons.forEach((b, n) => {
      if (b.state == undefined) return;
      if (b.factions.includes(faction)) score++;
    })
    player.score += score;
    //  TODO: include color matches from score counters
  }

  /** advance each player's score by the rank of each meeple; TODO: player chooses counter */
  scoreForRank(rank: number, pNdx: number, cb: () => void) {
    const plyr = this.allPlayers[pNdx], meeps = plyr.meeples;
    const nOfRank = meeps.filter(meep => meep.card.rank == rank).length;
    plyr.score +=  nOfRank * rank;
    setTimeout(() => cb(), 0)
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
