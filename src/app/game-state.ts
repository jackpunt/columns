import { C, stime } from "@thegraid/common-lib";
import { afterUpdate } from "@thegraid/easeljs-lib";
import { GameState as GameStateLib, Phase as PhaseLib } from "@thegraid/hexlib";
import { ColSelButton, type CardButton } from "./card-button";
import { type ColMeeple } from "./col-meeple";
import { ColTable as Table } from "./col-table";
import type { AdvDir, BumpDir2, BumpDirA, BumpDirC, GamePlay, Step } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";

interface Phase extends PhaseLib {
  rowScores?: {plyr: Player, score: number}[][],
  draggable?: boolean,
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
  get turnId() { return this.roundNumber + this.turnOfRound / 10 }
  get isGUI() { return !!this.table.stage.canvas }
  /** latest bumpDir from ResolveWinner */
  bumpDir!: BumpDirC;

  override start(startPhase?: string, startArgs?: any[]): void {
    super.start(startPhase, startArgs);
  }

  override phase(phase: string, ...args: any[]): void {
    const M = this.isGUI ? 'M' : 'P';
    const robos = this.gamePlay.allPlayers.map(p => p.useRobo ? 'R' : M).join('-')
    // console.log(stime(this, `.phase: robos = ${robos} ${this.state?.Aname ?? 'Initialize'} -> ${phase}`), args)
    super.phase(phase, ...args)
  }
  override saveState(): any[] {
    return [this.state.Aname] as [string];
  }

  override parseState(gameState: any[]): void {
    const [Aname, ...args] = gameState as [string, ...any[]];
    this.startPhase = Aname;
    this.startArgs = args;
    return;
  }

  // auto-proceed to done() vs wait for click
  get autoDone() { return this.state && ['SelectCol'].includes(this.state.Aname!) }

  _cardDone?: CardButton = undefined;
  get cardDone() { return this._cardDone; }
  set cardDone(v) { // BidCard or CoinCard selected [not committed]; "maybeDone"
    this._cardDone = v;    // most recent selection, pro'ly not useful
    // console.log(stime(this, `.cardDone: ${v?.Aname} ${v?.player.Aname} \n`), this.gamePlay.mapString);
    const allDone = this.allDone;
    this.table.doneButton.paint(allDone ? C.lightgreen : C.YELLOW);
    this.gamePlay.table.stage.update()
    if (allDone && this.autoDone) {
      setTimeout(() => this.done(true), 4); // CollectBids / SelectCol is done
    }
  }

  get allDone() {
    const notDone = this.gamePlay.allPlayers.find(plyr => !plyr.isDoneSelecting())
    if (notDone) this.table.gamePlay.curPlayer = notDone;
    const plyr = notDone, card = this._cardDone, card_plyr = card?.player;
    // console.log(stime(`gameState.allDone: ${this.state.Aname} card_plyr: ${card_plyr?.Aname} `), this._cardDone?.Aname, plyr?.isDoneSelecting()?.Aname)
    return !notDone;
  }

  winnerMeep?: ColMeeple;

  get panel() { return this.curPlayer.panel; }

  /** States for 'Columns' (Knives-Out, Ambition, '"利刃出击"' '"利刃出鞘"') */
  override readonly states: { [index: string]: Phase } = {
    Idle: {
      start: () => {
        return; // Don't start anything, PlayerB will drive the state
      }
    },
    SelectCol: {
      start: () => {
        this.gamePlay.turnNumber = -1; // so BeginTurn can increment.
        if (TP.numPlayers > TP.useXtraMeep ||
          this.gamePlay.allPlayers[0].meeples.length > this.nCols) {
          this.phase('BeginRound');
          return;
        }
        this.doneButton(`Select Extra Column`, C.YELLOW, () => {
          this.gamePlay.allPlayers.forEach(plyr => plyr.selectCol())
        })
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          // curPlayer is set:
          this.panel.areYouSure('This player has not selected.',
            () => this.state.start(), // or: force-select cards for each.
            () => this.state.start());
          return;
        }
        if (this.allDone || ok) {
          this.gamePlay.allPlayers.forEach(plyr => {
            const xColId = plyr.isDoneSelecting()!.colId;
            const meep = plyr.makeMeeple(xColId, '*');
            const card = this.gamePlay.blackN.find(card => card.colId == xColId)!
            card.addMeep(meep, 0);
            // plyr.clearButtons();
          })
          // console.log(stime(this, `.SelectCol.done: \n`), this.gamePlay.mapString);
          this.phase('BeginRound');
        }
      }
    },
    // BeginRound: allPlayer activated;
    // see also: table.setNextPlayer(turnNumber) -> GamePlay.startTurn()
    // table.startGame() -> setNextPlayer(0) -> curPlayer.newTurn()
    BeginRound: {
      start: () => {
        this.gamePlay.allPlayers.forEach(plyr => plyr.clearButtons())
        // console.log(stime(this, `.BeginRound.start: \n`), this.gamePlay.mapString);
        this.phase('BeginTurn'); // do first turn of round
      }
    },
    BeginTurn: {
      start: () => {
        this.gamePlay.setNextPlayer();  // advance turnNumber & turnOfRound
        this.gamePlay.saveGame(); // --> gamePlay.scenarioParser.saveState(gamePlay)
        console.log(stime(this, `.BeginTurn.start: ${this.turnId} \n`), this.gamePlay.mapString);
        setTimeout(() => this.phase('CollectBids'), 0);
      }
    },
    CollectBids: {
      start: () => {
        this.doneButton(`Make Bids ${this.turnId}`, C.YELLOW, () => {
          this.gamePlay.allPlayers.forEach(plyr => plyr.collectBid()) // cb --> cardDone
        })
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('This player has not selected.',
            () => this.state.start(), // or: force-select cards for each.
            () => this.state.start());
          return;
        }
        // console.log(stime(this, `.CollectBids.done: \n`), this.gamePlay.mapString);
        if (this.allDone || ok) {
          // show all bids
          this.gamePlay.allPlayers.forEach(plyr => {
            plyr.colSelButtons.forEach(b => b.showSelected(false))
            plyr.colBidButtons.forEach(b => b.showSelected(false))
          })
          afterUpdate(this.gamePlay.table.stage, () => this.phase('ResolveWinner', 1))
        }
      }
    },
    ResolveWinner: { // resolve winner, select & advance meep
      draggable: true,
      start: (col = 1) => {
        // col index colNames, so 1..nc; blackN is indexed [0..nc-1]
        const blackN = this.gamePlay.blackN, bCard = blackN[col - 1], colId = bCard?.colId;
        this.winnerMeep = undefined;
        if (this.gamePlay.isEndOfGame()) { return this.phase('EndGame') }
        if (col > blackN.length) { return this.phase('EndTurn') }
        if (bCard.factions.length == 0) { return this.phase('ResolveWinner', col + 1) }
        // calls player.advanceOneMeeple(meeps, cb_advanceMeeple)
        this.gamePlay.resolveWinnerAndAdvance(col, (step?: Step<AdvDir>) => {
          setTimeout(() => this.state.done!(col, step), TP.flipDwell)
        })
      },
      // col - track progress; meep - new/final location; {fromHex, ndx, advDir} - Step to current location
      done: (col: number, step?: Step<AdvDir>) => {
        // ASSERT: step.dir.startsWith('N'); ...but that's not important now.
        const meep = step?.meep;
        this.winnerMeep = meep; // may be in top-row; not a real Step
        if (meep) {
          this.phase('BumpFromAdvance', col, meep);
        } else {
          this.phase('MeepsToCol', col);
        }
      }
    },
    // Similar to BumpAndCascade: initial bump: ['N'] or ['SS','S']
    BumpFromAdvance: {
      draggable: true,
      // meep.player chooses a bumpDir, and moveMeep(bumpee, card, ndx)
      // first: dirs = [SS, S] or [N]: BumpDirA[];
      start: (col: number, meep: ColMeeple) => {
        const card0 = meep.card, ndx = meep.cellNdx;
        const toBump = card0.otherMeepInCell(meep, ndx); // on Black every meep gets its own cell.
        if (toBump) {
          const plyr = meep.player// as IPlayer;
          const upBump = (toBump.player == plyr) || (meep.card.hex.row == 1);
          this.gamePlay.bumpAfterAdvance(meep, toBump, (step: Step<BumpDir2>) => {
            const dir = this.gamePlay.cascadeDir(); // step.dir --> <S|N>
            const other = toBump, meep = step.meep; // for debugger, logpoint
            if (upBump && dir !== 'N') debugger; // 'N' required?
            this.phase('MeepsToCol', col)
          })
          return;
        }
        this.phase('MeepsToCol', col); // cleanup and verify no more bumps
      }
    },
    BumpAndCascade: { // winner|bumpee's meep identified and moved: cascade
      // initial: resolveWinner -> advDir: {N, NW, NE};
      // secondary: meepsToCol -> advDir: {N}
      draggable: true,
      start: (col: number, meep: ColMeeple, step: Step<BumpDirC>) => {
        const colId = ColSelButton.colNames[col];
        this.gamePlay.setCurPlayer(meep.player); // light up the PlayerPanel
        meep.highlight(true);
        this.table.logText(`Col-${colId} from ${step.fromCard}#${step.ndx}->${step.dir} --> ${meep}`, `GameState: 'BumpAndCascade'`);
        const bumpDone = () => setTimeout(() => this.phase('MeepsToCol', col), TP.flipDwell);
        this.doneButton(`bump & cascade ${col} done`, meep.player.color, () => {
          // this.gamePlay.advanceMeeple(meep, step.dir, step.ndx, bumpDone); // advance; bump & cascade -> bumpDone
          this.gamePlay.bumpAndCascade(meep, bumpDone); // ???
        });
        return;
      },
    },
    MeepsToCol: {
      // when bump and cascade has settled: cleanup placement of meeps
      // and find unresolved bumps? (from manual moves?)
      start: (col) => {
        // const col = this.state.col as number;
        this.winnerMeep?.highlight(false);
        const meep = this.gamePlay.meeplesToCell(col)
        if (meep) {
          const step: Step<BumpDirC> = { meep, fromCard: meep.card, ndx: meep.cellNdx!, dir: this.gamePlay.cascDir!, }
          afterUpdate(meep, () => this.phase('BumpAndCascade',col, meep, step), this, 10)
          return;
        }
        // TODO: add option/doneButton to 'confirm before score'
        // so GUI can fix a silly move...
        // update faction counters for each Player:
        this.gamePlay.allPlayers.forEach(plyr => plyr.setFactionCounters())
        this.gamePlay.scoreForColor(this.winnerMeep, () => {
          setTimeout(() => this.phase('ResolveWinner', col + 1), TP.flipDwell) // Resolve next col
        });
      }
    },
    EndTurn: {
      start: () => {
        this.logScores('EndTurn');
        this.gamePlay.allPlayers.forEach(plyr => plyr.doneifyCards());
        const endOfRound = (this.turnOfRound == 3)
        this.phase(endOfRound ? 'EndRound' : 'BeginTurn');
      },
    },
    EndRound: {
      start: () => {
        // score for rank:
        const rowScores = this.gamePlay.scoreForRank(), nRows = this.gamePlay.nRows;
        this.state.rowScores = rowScores; // for AutoPlayer to consider
        const advanceNextScore = (row: number) => {
          if (this.gamePlay.isEndOfGame()) { this.done(true); return }
          const rank = nRows - 1 - row;
          if (rank < 1) { this.done(); return } // no score for rank0; DONE
          if (row > rowScores.length - 1) { debugger; } // expect rank = 0
          if (rowScores[row].length == 0) { advanceNextScore(row + 1); return; }
          const { plyr, score } = rowScores[row][0]
          rowScores[row].shift(); // remove {plyr,score}; rowScores.length -> rank
          this.doneButton(`Advance Markers for Rank ${rank}: ${score}`, plyr.color);
          plyr.advanceMarker(score, rowScores.slice(), () => advanceNextScore(row))
        }
        advanceNextScore(0)
      },
      done: (eog = this.gamePlay.isEndOfGame()) => {
        this.logScores();
        this.phase(eog ? 'EndGame' : 'BeginRound');
      }
    },
    EndGame: {
      start: () => {
        this.gamePlay.saveGame();
        this.logScores('EndGame');
        const playersByscore = this.gamePlay.allPlayers.slice();
        playersByscore.sort((a, b) => b.rankScoreNow - a.rankScoreNow); // tie breaker
        playersByscore.sort((a, b) => b.score - a.score )
        const winp = playersByscore[0]
        this.gamePlay.logWriterLine0('finish', { 'winner': winp.index, 'winColor': winp.Aname })
        this.doneButton(`End of Game! ${winp.Aname}\n(click for new game)`, winp.color)
      },
      done: () => {
        this.gamePlay.logWriter?.showBacklog();
        this.gamePlay.gameSetup.restart({});
      }
    }
  }
  logScores(label = 'EndRound') {
    const scores = this.gamePlay.allPlayers.map(plyr => plyr.score);
    this.table.logText(`${label} ${this.turnId} scores: ${scores}`,)
  }
}
