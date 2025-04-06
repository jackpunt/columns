import { C, stime } from "@thegraid/common-lib";
import { afterUpdate } from "@thegraid/easeljs-lib";
import { GameState as GameStateLib, Phase as PhaseLib } from "@thegraid/hexlib";
import { ColSelButton, type CardButton } from "./card-button";
import { type ColMeeple } from "./col-meeple";
import { ColTable as Table } from "./col-table";
import type { AdvDir, BumpDir2, BumpDirC, GamePlay, Step } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";

interface Phase extends PhaseLib {
  rowScores?: ReturnType<GamePlay["scoreForRank"]>,
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
    return [this.state?.Aname ?? this.startPhase] as [string];
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

  _doneClicked: (evt: any, data?: any) => void = () => {}
  doneClicked(evt: any, data?: any) {
    this._doneClicked.call(this, evt, data);
  }
  whenDoneClicked(onClick: (evt: any, data?: any) => void) {
    this._doneClicked = onClick;
  }
  override doneButton(label?: string, color?: string, afterPopup?: () => void) {
    const rv = super.doneButton(label, color, afterPopup)
    this.whenDoneClicked(() => this.done())
    return rv
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
        console.log(stime(this, `.BeginTurn.start: ${this.turnId} \n`), this.gamePlay.mapString);
        setTimeout(() => this.phase('CollectBids'), 0);
      }
    },
    CollectBids: {
      start: () => {
        this.gamePlay.saveGame(); // --> gamePlay.scenarioParser.saveState(gamePlay)
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
          this.gamePlay.logText(`${this.gamePlay.allPlayers.map(p => p.bidStr)}`, `CollectBids:`)
          afterUpdate(this.gamePlay.table.stage, () => this.phase('ResolveWinner', 1))
        }
      }
    },
    ResolveWinner: { // resolve winner, select & advance meep
      draggable: true,
      start: (col = 1) => {
        this.winnerMeep = undefined;
        if (this.gamePlay.isEndOfGame()) { return this.phase('EndGame') }
        // col index colNames, so 1..nc; blackN is indexed [0..nc-1]
        const blackN = this.gamePlay.blackN, bCard = blackN[col - 1], colId = bCard?.colId;
        if (col > blackN.length) { return this.phase('EndTurn') }
        if (bCard.maxCells == 0) { return this.phase('ResolveWinner', col + 1) } // skip BlackNull column
        // calls player.advanceOneMeeple(meepsInCol, cb_advanceMeeple)
        this.gamePlay.resolveWinnerAndAdvance(colId, (step?: Step<AdvDir>) => {
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
          this.phase('AfterMoveMeep', col);
        }
      }
    },
    // initial bump: ['N'] or ['SS','S']
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
            if (upBump && dir !== 'N') debugger; // 'N' required?
            this.phase('AfterMoveMeep', col)
          })
          return;
        }
        this.phase('AfterMoveMeep', col); // cleanup and verify no more bumps
      },
    },
    AfterMoveMeep: {
      start: (col) => {
        // Resolve collision/bump OR ScoreForColor & continue to next Column.
        console.log(stime(this, `.AfterMoveMeep: meepsToMove=`), this.gamePlay.meepsToMove.map(b => `${b}`))
        const meep = this.gamePlay.meepsToMove[0];
        if (meep) {
            afterUpdate(meep, () => this.phase('BumpAndCascade', col, meep), this, 10)
          return;
        }
        // TODO: add option/doneButton to 'confirm before score'
        // so GUI can fix a silly move...
        // update faction counters for each Player:
        this.gamePlay.allPlayers.forEach(plyr => plyr.setFactionCounters())
        this.gamePlay.scoreForColor(this.winnerMeep, () => {
          this.winnerMeep?.player.doneifyCards()
          setTimeout(() => this.phase('ResolveWinner', col + 1), TP.flipDwell) // Resolve next col
        });
      }
    },
    BumpAndCascade: {
      // winner|bumpee's meep identified and moved: cascade
      // initial: resolveWinner -> advDir: {N, NW, NE};
      // secondary: meepsToCol -> advDir: {N}
      draggable: true,
      start: (col: number, meep: ColMeeple) => {
        const step: Step<BumpDirC> = { meep, fromCard: meep.card, ndx: meep.cellNdx!, dir: this.gamePlay.cascDir!, }
        const colId = ColSelButton.colNames[col];
        const other = meep.card.otherMeepInCell(meep)!; // MeepsToCell would not invoke unless other
        const ex = `Col-${colId} from ${step.fromCard}#${step.ndx}[${step.dir}] --> ${meep} & ${other?.toString() ?? '-'}`
        console.log(stime(this, `.BumpAndCascade:`), ex);

        // meep.highlight(true);
        const bumpDone = () => setTimeout(() => this.phase('AfterMoveMeep', col), TP.flipDwell);
        // manual will call bumpDone for each step.
        // auto will loop internally, then call bumpDone and return
        this.gamePlay.bumpAndCascade(meep, other, bumpDone); // ???
        return;
      },
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
        const rowScores = this.gamePlay.scoreForRank(), ndxMax = rowScores.length - 1;
        this.state.rowScores = rowScores.slice(); // orig/full rowScores
        const slog = TP.logFromSubGame;
        const tlog = slog || this.isGUI;
        tlog && console.log(stime(this, `.EndRound: rowScores=`), this.state.rowScores)
        const advanceNextScore = (ndx = 0) => {
          if (this.gamePlay.isEndOfGame()) { this.done('EndGame'); return }
          if (ndx > ndxMax) { this.done('BeginRound'); return } // no more scores: DONE
          const { plyr, rank, score } = rowScores[ndx++]
          this.doneButton(`Advance Marker ${plyr.Aname} ${rank}: ${score}`, plyr.color);
          plyr.advanceMarker(score, rowScores.slice(), () => advanceNextScore(ndx))
          plyr.sourceCounters[1].incValue(score);
        }
        advanceNextScore(0)
      },
      done: (nextPhase = 'BeginRound') => {
        this.logScores();
        setTimeout(() => this.phase(nextPhase), TP.flashDwell);
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
        this.table.logText(`winner: ${winp.Aname}`)
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
