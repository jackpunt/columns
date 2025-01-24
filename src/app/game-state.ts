import { C } from "@thegraid/common-lib";
import { GameState as GameStateLib, Phase as PhaseLib } from "@thegraid/hexlib";
import type { ColCard } from "./col-card";
import { ColTable as Table } from "./col-table";
import type { GamePlay } from "./game-play";
import type { OrthoHex2 } from "./ortho-hex";
import { Player, type CardButton, type ColMeeple } from "./player";

interface Phase extends PhaseLib {
  col?: number, // for ScoreForRank
}
export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  constructor(gamePlay: GamePlay) {
    super(gamePlay);
      this.defineStates(this.states, false);
  }
  get nCols() { return this.gamePlay.nCols }
  declare state: Phase;
   // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }
  get turnOfRound() { return this.gamePlay.turnNumber % 3}

  override parseState(gameState: any[]): void {
    return;
  }

  _cardDone?: CardButton = undefined;
  get cardDone() { return this._cardDone; }
  set cardDone(v) { // BidCard or CoinCard selected [not committed]
    this._cardDone = v;    // most recent selection, pro'ly not useful
    if (this.allDone) this.phase('ResolveWinner');
  }

  get allDone() {
    const notDone = this.gamePlay.allPlayers.find(plyr => !plyr.isDoneSelecting())
    if (notDone) this.table.gamePlay.curPlayer = notDone;
    return !notDone;
  }

  winnerMeep?: ColMeeple;

  get panel() { return this.curPlayer.panel; }

  /** from Acquire, for reference; using base GameState for now */
  override readonly states: { [index: string]: Phase } = {
    // BeginRound: allPlayer activated;
    // see also: table.setNextPlayer(turnNumber) -> GamePlay.startTurn()
    // table.startGame() -> setNextPlayer(0) -> curPlayer.newTurn()
    BeginRound: {
      start: () => {
        this.gamePlay.resetPlayerCards();
        this.phase('BeginTurn'); // do first turn of round
      }
    },
    BeginTurn: {
      start: () => {
        this.saveGame();
        this.table.doneButton.activate()
        this.phase('CollectBids');
      },
      done: () => {
        this.phase('CollectBids');
      }
    },
    CollectBids: {
      start: () => {
        const round = Math.ceil((1 + this.gamePlay.turnNumber) / 3), trn = 1 + this.turnOfRound
        this.doneButton(`End Turn ${round}:${trn}`, C.GREEN);
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('This player has not selected.', () => {
            setTimeout(() => this.done(true), 50);
          }, () => {
            setTimeout(() => this.state.start(), 50);
          });
          return;
        }
        if (this.allDone || ok) this.phase('ResolveWinner');
      }
    },
    ResolveWinner: { // resolve winner, select & advance meep
      start: (col = 0) => {
        this.winnerMeep = undefined;
        if (col >= this.nCols) this.phase('EndTurn');
        const colMeep = (meep?: ColMeeple) => {
          if (col >= this.nCols) return; // zombie colMeep callback!
          this.phase('BumpAndCascade', col, meep)
        };
        this.gamePlay.resolveWinner(col, colMeep)
      }
    },
    BumpAndCascade: { // winner/bumpee's meep identified and moved: cascade
      col: 0,
      start: (col: number, meep?: ColMeeple) => {
        this.state.col = col;
        if (!this.winnerMeep) this.winnerMeep = meep; // maybe undefined
        if (!meep) { this.phase('ResolveWinner', col + 1); return }
        const card = (meep.card.hex.nextHex('N') as OrthoHex2).card as ColCard;// assert: there is a Card
        card.addMeep(meep);
        this.table.logText(`${meep} advanced`); meep.unMove
        this.doneButton(`bump & cascade ${col} done`, meep.player.color);
        // click(evt, data)--> gamePlay.phaseDone(data)->gameState.done(data)->phase(donePhase(), data)-->start(data)
        // if (meep.cellNdx === undefined) player.bump(meeps, (col, meep)=>void)
        // else score(winnerMeep)
      },
      done: () => {
        this.gamePlay.scoreForColor(this.winnerMeep)
        this.phase('ResolveWinner', (this.state.col ?? 0) + 1)
      }
    },
    EndTurn: {
      start: () => {
        this.gamePlay.allPlayers.forEach(plyr => plyr.commitCards())
        this.gamePlay.setNextPlayer();  // advance turnNumber & turnOfRound
        const endOfRound = (this.turnOfRound == 0)
        this.phase(endOfRound ? 'EndRound' : 'BeginTurn');
      },
    },
    EndRound: {
      start: (rank = 1, pNdx = 0) => {
        // scoreForRank(rank, pNdx, (rank, pNds) => void)
        if (pNdx == this.gamePlay.allPlayers.length) { rank += 1; pNdx = 0 };
        if (rank > this.gamePlay.nRows - 1) this.done();
        this.gamePlay.scoreForRank(rank, pNdx, () => this.state.start(rank, pNdx + 1));
        // there may be GUI for player to choose counter to advance...
      },
      done: () => {
        this.phase(this.gamePlay.isEndOfGame() ? 'EndGame' : 'BeginRound');
      }
    },
    EndGame: {
      start: () => {
        if (this.gamePlay.isEndOfGame()) {
          this.doneButton(`End of Game`, C.RED, () => {this.gamePlay.gameSetup.restart({})})
        }
      }
    }
  }
}
