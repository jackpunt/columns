import { removeEltFromArray, stime } from "@thegraid/common-lib";
import { newPlanner, NumCounterBox, Player as PlayerLib, type Hex1, type NumCounter } from "@thegraid/hexlib";
import { GamePlay } from "./game-play";
import { CardPanel, ColCard } from "./col-card";
import { OrthoHex2 as Hex2 } from "./ortho-hex";
import { type ColTable as Table } from "./col-table";
import { TP } from "./table-params";

// do not conflict with AF.Colors
const playerColors = ['gold', 'lightblue', 'violet', 'blue', 'orange', ] as const;

export type PlayerColor = typeof playerColors[number];
export class Player extends PlayerLib {
  static initialCoins = 400;
  // set our multi-player colors (concept from Ankh?); we don't use the TP.colorScheme
  static { PlayerLib.colorScheme = playerColors.concat() }
  static override colorScheme: PlayerColor[];
  override get color(): PlayerColor {
    return super.color as PlayerColor;
  }
  override set color(c:  PlayerColor) {
    super.color = c;
  }

  declare gamePlay: GamePlay;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
  }

  static override allPlayers: Player[];

  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  override newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    super.newGame(gamePlay, url);
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  // only invoked on the newly curPlayer!
  override newTurn() {
    // nothing to do... until 'Move' action.
    // this.ships.forEach(ship => ship.newTurn());
    // return;
  }

  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  override playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.plyrId}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // continue any semi-auto moves
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }

  // 2 score counters (advancing on track)
  // [AvailGreen, ChoosenYellow, UsedRed-disabled]
  // 4 CoinBid cards (shrink to buttons, disable when played)
  // nc ColSelect cards (shrink to buttons)
  //
  override makePlayerBits(): void {
    super.makePlayerBits()

    // display coin counter:
    const { wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .7;
    const ic = this.coins;
    const cc = this.coinCounter = new NumCounterBox('coins', ic, undefined, fs);
    cc.x = wide - 2 * gap; cc.y = cc.high / 2 + 2 * gap;
    cc.boxAlign('right');
    this.panel.addChild(cc);

    const nn = this.counter1 = new NumCounterBox('net', 0, 'violet', fs)
    nn.x = 2 * gap; nn.y = cc.high / 2 + 2 * gap;
    nn.boxAlign('left');
    this.panel.addChild(nn);

    const mnl = this.counter2 = new NumCounterBox('net', 0, 'violet', fs)
    mnl.x = nn.wide + 3 * gap; mnl.y = cc.high / 2 + 2 * gap;
    mnl.boxAlign('left');
    this.panel.addChild(mnl);
  }
  counter2!: NumCounter;
  counter1!: NumCounter;

  updateNetCounters() {
  }
}
