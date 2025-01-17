import { stime } from "@thegraid/common-lib";
import { ScenarioParser as SPLib, SetupElt as SetupEltLib, type Tile, type TileSource } from "@thegraid/hexlib";
import { type GamePlay, } from "./game-play";
import { ColCard } from "./col-card";
import { Player } from "./player";


export interface SetupElt extends SetupEltLib {
  // Aname?: string,        // {orig-scene}@{turn}
  // turn?: number;         // default to 0; (or 1...)
  // coins?: number[],      // 1
  // gameState?: any[];     // GameState contribution

  time?: string,         // stime.fs() when state was saved.
  tiles?: string[][],    // Tile->string[] per player
  cards?: string[][],  // OR: ident of PathCard
  rules?: string[],    // OR: ident of PathCard
}

export class ScenarioParser extends SPLib {
  declare gamePlay: GamePlay;
  setUnitsFromSource<T extends Tile>(nameArys: string[][] | undefined, type: { source: TileSource<T> },
    getItem: ((name: string) => T | undefined) | undefined,
    setItem: (player: Player) => (item: T | undefined) => any) {
    if (getItem === undefined) getItem = (name) => type.source.filterUnits().find(u => u.Aname == name);
    nameArys?.forEach((names, pndx) => {
      const player = Player.allPlayers[pndx];
      names.forEach(name => {
        const item = getItem(name)
        if (!item) {
          console.warn(stime(this, `.tiles: bad tileName "${name}" pIndex:${pndx} nameArys=`), nameArys);
          return;
        }
        setItem(player)(type.source.nextUnit(item))
      })
    })
  }
  override parseScenario(setup: SetupElt) {
    console.log(stime(this, `.parseScenario: newState =`), setup);

    const { gameState, turn, tiles, cards, rules } = setup;
    const map = this.map, gamePlay = this.gamePlay, allPlayers = gamePlay.allPlayers, table = gamePlay.table;
    const turnSet = (turn !== undefined); // indicates a Saved Scenario: assign & place everything
    if (turnSet) {
      gamePlay.turnNumber = turn;
      table.logText(`turn = ${turn}`, `parseScenario`);
      this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }

    this.setUnitsFromSource(cards, ColCard,
      (name) => ColCard.cardByName.get(name),
      (player) => player.addCard,
    )

    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.hexMap.update();
  }

  /** add the elements are are not in SetupEltLib */
  override addStateElements(setupElt: SetupElt): void {
    const namesOf = (ary: (Tile | undefined)[]) => ary.map(tile => tile?.Aname ?? '').filter(n => !!n);
    const table = this.gamePlay.table;
    const gameState = this.gamePlay.gameState.saveState();
    const tiles = Player.allPlayers.map(p => namesOf(p.tiles)).filter(t => !!t)
    const cards = Player.allPlayers.map(p => namesOf(p.cards)).filter(c => !!c)
    const rCards = table.cardRack.map(hex => hex.card);
    const rules = namesOf(rCards);
    setupElt.gameState = gameState;
    setupElt.cards = cards;
    setupElt.tiles = tiles;
    setupElt.rules = rules;
  }

}
