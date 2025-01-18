import { GameState as GameStateLib, Phase, type Tile } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { ColCard } from "./col-card";
import { ColTable as Table } from "./col-table";
import { Player } from "./player";

export type ActionIdent = 'Act0' | 'Act2';

export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  constructor(gamePlay: GamePlay) {
    super(gamePlay)
    this.defineStates(this.states, false);
  }

   // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  override parseState(gameState: any[]): void {
    return;
  }

  _cardDone?: ColCard = undefined;
  get cardDone() { return this._cardDone; }
  set cardDone(v) { // card selected for bid [maybe not committed]
    this._cardDone = v;
    v?.dim(!!v)
    if (this.allDone) this.done();
  }
  /** return true if given tile/card is the current doneTile/doneCard */
  notDoneTile(tile: Tile, card = false) {
    return (card
      ? (this.cardDone && tile !== this.cardDone)
      : false);
  }

  get allDone() { return this.cardDone }


  get panel() { return this.curPlayer.panel; }

  /** from Acquire, for reference; using base GameState for now */
  override readonly states: { [index: string]: Phase } = {
    BeginTurn: {
      start: () => {
        this.cardDone = undefined;
        this.saveGame();
        this.table.doneButton.activate()
        this.phase('ChooseAction');
      },
      done: () => {
        this.phase('ChooseAction');
      }
    },
    // ChooseAction:
    // if (allDone) phase(EndTurn)
    ChooseAction: {
      start: () => {
        if (this.cardDone) this.phase('EndTurn');
        this.doneButton(`End Turn`);
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('You have an unused action.', () => {
            setTimeout(() => this.done(true), 50);
          }, () => {
            setTimeout(() => this.state.start(), 50);
          });
          return;
        }
        if (this.allDone || ok) this.phase('EndTurn');
      }
    },
    EndTurn: {
      start: () => {
        this.gamePlay.endTurn();
        this.phase('BeginTurn');
      },
    },
  }
}
