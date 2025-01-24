import { permute, stime } from "@thegraid/common-lib";
import { Meeple, ScenarioParser as SPLib, SetupElt as SetupEltLib, type Tile, type TileSource } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import { type GamePlay, } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";


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
    {
      const np = this.gamePlay.gameSetup.nPlayers
      ColCard.makeAllCards(TP.mHexes, TP.nHexes, np,); // populate ColCard.cardByName
      this.placeCardsOnMap();
    }
    {
      this.placeMeeplesOnMap();
    }

    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.hexMap.update();
  }

  // TODO: parameterize with savedState (vs permute)
  placeCardsOnMap() {
    const allCards = ColCard.allCards
    const black = allCards.filter(card => card.faction == 0);
    const other = allCards.filter(card => card.faction != 0);
    const plain = other.filter(card => !card.Aname.includes('&'));
    const duals = other.filter(card => card.Aname.includes('&'));
    permute(plain)
    permute(duals)
    const nc = TP.mHexes, nr = TP.nHexes, nCards = nc * nr, nd = TP.rDuals;
    const ndual = Math.round(nCards * nd), nplain = nCards - ndual;
    const duals0 = duals.slice(0, ndual)
    const plain0 = plain.slice(0, nplain)
    const cards = duals0.concat(plain0);
    permute(cards);

    this.gamePlay.hexMap.forEachHex(hex => {
      const row = hex.row, col = hex.col;
      const card = ((row == 0 || row == nr - 1) ? black.shift() : cards.shift()) as ColCard;
      card.rank = (nr - row) - 1;
      card.moveTo(hex);
      return;
    })
    this.gamePlay.gameSetup.update()
    return;
  }

  placeMeeplesOnMap() {
    // TODO: supply row,col for each meeple from savedState
    Meeple.allMeeples.length = 0;    // reset all Meeples; should be in Tile.clearAllTiles() ?
    this.gamePlay.forEachPlayer(player => {
      (player as Player).makeMeeples(this.gamePlay.hexMap)
    })
  }

  /** add the elements are are not in SetupEltLib */
  override addStateElements(setupElt: SetupElt): void {
    const namesOf = (ary: (Tile | undefined)[]) => ary.map(tile => tile?.Aname ?? '').filter(n => !!n);
    const table = this.gamePlay.table;
    const gameState = this.gamePlay.gameState.saveState();
    setupElt.gameState = gameState;
  }

}
