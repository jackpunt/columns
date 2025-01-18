import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, type HexMap, TP as TPLib } from "@thegraid/hexlib";
import { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { OrthoHex } from "./ortho-hex";
import type { ColTable } from "./col-table";
import type { Player } from "./player";
import { TP } from "./table-params";
import { stime } from "@thegraid/common-lib";


export class GamePlay extends GamePlayLib {
  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
  }
  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap<OrthoHex>
  declare table: ColTable;

  declare curPlayer: Player;
  override startTurn() {
  }

  // Demo from Acquire to draw some tiles:
  playerDone() {
    const plyr = this.curPlayer;
    plyr.gamePlay.hexMap.update(); // TODO: this.playerDone(ev)
  }

  brake = false; // for debugger
  /** for conditional breakpoints while dragging; inject into any object. */
  toggleBrake() {
    const brake = (this.brake = !this.brake);
    ;(this.table as any)['brake'] = brake;
    ;(this.hexMap.mapCont.markCont as any)['brake'] = brake;
    console.log(stime(this, `.toggleBreak:`), brake)
  }

  undoCardDraw() {
    const card = this.gameState.cardDone
    if (card) {
      // even from table.cardRack! [not a complete undo]
      this.table.cardSource.availUnit(card);
      this.gameState.cardDone = undefined;
    }
  }

  override bindKeys(): void {
    super.bindKeys();
    const table = this.table;
    KeyBinder.keyBinder.setKey('C-z', () => this.undoCardDraw());
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
