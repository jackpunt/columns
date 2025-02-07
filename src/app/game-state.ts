import { C } from "@thegraid/common-lib";
import { afterUpdate } from "@thegraid/easeljs-lib";
import { GameState as GameStateLib, Phase as PhaseLib } from "@thegraid/hexlib";
import { type CardButton, type ColMeeple } from "./col-meeple";
import { ColTable as Table } from "./col-table";
import type { GamePlay } from "./game-play";
import { Player } from "./player";

interface Phase extends PhaseLib {
  col?: number, // for ScoreForRank
}
namespace GS {
  export const tpr = 3; // turns per round
}
export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  constructor(gamePlay: GamePlay) {
    super(gamePlay);
      this.defineStates(this.states, false);
  }
  get nCols() { return this.gamePlay.nCols }
  declare state: Phase;
  override startPhase = 'SelectCol';

   // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }
  get turnOfRound() { return 1 + this.gamePlay.turnNumber % GS.tpr}
  get roundNumber() { return 1 + Math.floor(this.gamePlay.turnNumber / GS.tpr) }

  override parseState(gameState: any[]): void {
    return;
  }

  autoDone = false; // auto-proceed to done() vs wait for click
  _cardDone?: CardButton = undefined;
  get cardDone() { return this._cardDone; }
  set cardDone(v) { // BidCard or CoinCard selected [not committed]; "maybeDone"
    this._cardDone = v;    // most recent selection, pro'ly not useful
    if (this.allDone) {
      this.table.doneButton.paint(C.lightgreen);
      this.gamePlay.hexMap.update();
      if (this.autoDone) this.done(true); // CollectBids / SelectCol is done
    } else {
      this.table.doneButton.paint(C.YELLOW);
      this.gamePlay.hexMap.update();
    }
  }

  get allDone() {
    const notDone = this.gamePlay.allPlayers.find(plyr => !plyr.isDoneSelecting())
    if (notDone) this.table.gamePlay.curPlayer = notDone;
    return !notDone;
  }

  winnerMeep?: ColMeeple;

  get panel() { return this.curPlayer.panel; }

  /** States for 'Columns' (Knives-Out, Intrigue) */
  override readonly states: { [index: string]: Phase } = {
    SelectCol: {
      start: () => {
        this.doneButton(`Select Extra Column`, C.YELLOW)!.activate();
        this.gamePlay.allPlayers.forEach(plyr => plyr.selectCol()); // cb --> cardDone
      },
      done: () => {
        this.gamePlay.allPlayers.forEach(plyr => {
          const xtraCol = plyr.isDoneSelecting()?.colNum as number;
          plyr.makeMeeple(this.gamePlay.hexMap, xtraCol, undefined, '*');
          plyr.clearButtons();
        })
        this.phase('BeginRound')
      }
    },
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
        this.phase('CollectBids');
      }
    },
    CollectBids: {
      start: () => {
        const round = this.roundNumber, turn = this.turnOfRound
        this.doneButton(`Make Bids ${round}.${turn}`, C.YELLOW)!.activate()
        this.gamePlay.allPlayers.forEach(plyr => plyr.collectBid()); // cb --> cardDone
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('This player has not selected.',
            () => this.state.start(), // or: force-select cards for each.
            () => this.state.start());
          return;
        }
        if (this.allDone || ok) this.phase('ResolveWinner');
      }
    },
    ResolveWinner: { // resolve winner, select & advance meep
      start: (col = 1) => {
        this.winnerMeep = undefined;
        if (col > this.nCols) { this.phase('EndTurn'); return }
        const colMeep = (meep?: ColMeeple) => {
          setTimeout(() => {
            if (col > this.nCols) return; // zombie colMeep callback!
            this.phase('BumpAndCascade', col, meep)
          }, 0)
        };
        this.gamePlay.resolveWinner(col, colMeep)
      }
    },
    BumpAndCascade: { // winner/bumpee's meep identified and moved: cascade
      col: 1,
      start: (col: number, meep?: ColMeeple) => {
        this.state.col = col;
        if (!this.winnerMeep) this.winnerMeep = meep; // maybe undefined
        if (!meep) { this.phase('ResolveWinner', col + 1); return }
        this.gamePlay.setCurPlayer(meep.player);
        meep.highlight(true);
        this.table.logText(`${meep} in col ${col}`, `BumpAndCascade`);
        this.doneButton(`bump & cascade ${col} done`, meep.player.color);
        const bumpDone = () => { setTimeout(() => this.done(), 0) } // HACK: winner does it all
        this.curPlayer.bumpMeeple(meep, undefined, bumpDone); // advance | bump
      },
      done: () => {
        const col = this.state.col as number;
        this.winnerMeep?.highlight(false);
        const fails = this.gamePlay.meeplesToCell(col)
        if (fails) {
          afterUpdate(fails, () => this.state.start(col, fails))
          return;
        }
        this.gamePlay.allPlayers.forEach(plyr => plyr.countFactions())
        const nextCol = () => {
          setTimeout(() => this.phase('ResolveWinner', col + 1), 0)
        }
        this.gamePlay.scoreForColor(this.winnerMeep, nextCol)

      }
    },
    EndTurn: {
      start: () => {
        const scores = this.gamePlay.allPlayers.map(plyr => plyr.score)
        this.table.logText(`EndTurn ${this.roundNumber}.${this.turnOfRound} scores: ${scores}`, )
        this.gamePlay.allPlayers.forEach(plyr => plyr.commitCards())
        this.gamePlay.setNextPlayer();  // advance turnNumber & turnOfRound
        const endOfRound = (this.turnOfRound == 1)
        this.phase(endOfRound ? 'EndRound' : 'BeginTurn');
      },
    },
    EndRound: {
      start: () => {
        // score for rank:
        const rowScores = this.gamePlay.scoreForRow(), nRows = this.gamePlay.nRows;
        const advanceNextScore = (row: number) => {
          const rank = nRows - 1 - row;
          if (rank < 1) { this.done(); return } // no score for rank0; DONE
          if (row > rowScores.length - 1) { debugger; } // expect rank = 0
          if (rowScores[row].length == 0) { advanceNextScore(row + 1); return; }
          const { plyr, score } = rowScores[row][0]
          rowScores[row].shift(); // remove {plyr,score}
          this.doneButton(`Advance Markers for Rank ${rank}: ${score}`, plyr.color);
          plyr.advanceMarker(score, () => advanceNextScore(row))
        }
        advanceNextScore(0)
      },
      done: () => {
        const scores = this.gamePlay.allPlayers.map(plyr => plyr.score)
        this.table.logText(`EndRound ${this.roundNumber-1} scores: ${scores}`, )
        this.phase(this.gamePlay.isEndOfGame() ? 'EndGame' : 'BeginRound');
      }
    },
    EndGame: {
      start: () => {
        this.doneButton(`End of Game!\n(click for new game)`, C.RED)
      },
      done: () => {
        this.gamePlay.gameSetup.restart({});
      }
    }
  }
}
