import { permute, stime } from "@thegraid/common-lib";
import { Meeple, ScenarioParser as SPLib, SetupElt as SetupEltLib, type Tile, type TileSource } from "@thegraid/hexlib";
import { BlackCard, ColCard, DualCard, type Faction } from "./col-card";
import { type GamePlay } from "./game-play";
import { Player, type PlayerColor } from "./player";
import { TP } from "./table-params";

// rowElt.length = nCols
type RowElt = { fac: Faction[], meeps?: number[] }[];

export interface SetupElt extends SetupEltLib {
  // Aname?: string,        // {orig-scene}@{turn}
  // turn?: number;         // default to 0; (or 1...)
  // coins?: number[],      // 1
  // gameState?: any[];     // GameState contribution

  time?: string,            // stime.fs() when state was saved.
  nPlayers?: number;        // number of players, playerColors[index]
  pColors?: Record<PlayerColor, string>;  // if customized playerColors
  layout?: RowElt[];
  trackSegs?: string[];     // name of each TrackSegment
}

export class ScenarioParser extends SPLib {
  declare gamePlay: GamePlay;
  setUnitsFromSource<T extends Tile>(nameArys: string[][] | undefined, type: { source: TileSource<T> },
    getItem: ((name: string) => T | undefined) | undefined,
    setItem: (player: Player) => (item: T | undefined) => any)
  {
    const allPlayers = this.gamePlay.allPlayers;
    if (getItem === undefined) getItem = (name) => type.source.filterUnits().find(u => u.Aname == name);
    nameArys?.forEach((names, pndx) => {
      const player = allPlayers[pndx];
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

    const { gameState, turn, } = setup;
    const map = this.map, gamePlay = this.gamePlay, allPlayers = gamePlay.allPlayers, table = gamePlay.table;
    const turnSet = (turn !== undefined); // indicates a Saved Scenario: assign & place everything
    if (turnSet) {
      gamePlay.turnNumber = turn;
      table.logText(`turn = ${turn}`, `parseScenario`);
      this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }
    {
      // nCol, nRow
      ColCard.makeAllCards(TP.nHexes, TP.mHexes, ); // populate ColCard.cardByName
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
    const gp = this.gamePlay, nr = gp.nRows, nCards = (nr - 2) * gp.nCols;
    const black = BlackCard.allBlack;
    const pCards = ColCard.allCols.slice();
    const dCards = DualCard.allDuals.slice();
    const black0 = black.filter((card, n) => n >= gp.nCols); // row0; rankN
    const blackN = black.filter((card, n) => n < gp.nCols);  // rowN; rank0
    permute(pCards)
    permute(dCards)
    const nDual = Math.round(nCards * TP.rDuals), nPlain = nCards - nDual;
    const duals = dCards.slice(0, nDual)
    const plain = pCards.slice(0, nPlain)
    const cards = plain.concat(duals);
    permute(cards);

    const rank0 = nr - 1;
    this.gamePlay.hexMap.forEachHex(hex => {
      const row = hex.row;
      const card = (row == 0 ? black0 : row == rank0 ? blackN : cards).shift() as ColCard;
      card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
      hex.legalMark.doGraphicsDual(card)
      return;
    })
    this.gamePlay.gameSetup.update()
    return;
  }

  placeMeeplesOnMap() {
    // TODO: supply row,col for each meeple from savedState
    Meeple.allMeeples.length = 0;    // reset all Meeples; should be in Tile.clearAllTiles() ?
    const hexMap = this.gamePlay.hexMap, [nrows, ncols] = hexMap.nRowCol;
    this.gamePlay.forEachPlayer(player => {
      for (let col = 1; col <= ncols; col++) {
        (player as Player).makeMeeple(hexMap, col); // rank = 0
      }
    })
  }

  override addStateElements(setupElt: SetupElt) {
    const { time, turn } = setupElt;
    const scores = this.gamePlay.allPlayers.map(plyr => plyr.scoreCounters.map(sc => sc.value))
    const layout = this.gamePlay.getLayout();
    return { time, turn, scores, layout, }
  }

}
