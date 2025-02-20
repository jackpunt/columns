import { permute, removeEltFromArray, stime } from "@thegraid/common-lib";
import { ScenarioParser as SPLib, SetupElt as SetupEltLib } from "@thegraid/hexlib";
import { BlackCard, ColCard, DualCard } from "./col-card";
import { type Faction, type GamePlay } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";

// rowElt.length = nCols
type RowElt = { fac: Faction[], meeps?: number[] }[];

export interface SetupElt extends SetupEltLib {
  // Aname?: string,        // {orig-scene}@{turn}
  // turn?: number;         // default to 0; (or 1...)
  // coins?: number[],      // 1
  // gameState?: any[];     // GameState contribution
  time?: string,            // stime.fs() when state was saved.
  scores?: [value0: number, value1: number][][]; // vi for each marker for each player
  layout?: RowElt[];
}
interface StartElt extends SetupElt {
  n: number;         // number of players, colored by playerColors[index]
  playerColors?: string[];  // if custom playerColors
  trackSegs: string[];     // name of each TrackSegment
}

export class ScenarioParser extends SPLib {
  declare gamePlay: GamePlay;

  // from gameSetup.parseScenario:
  override parseScenario(setup: SetupElt & { start?: StartElt }) {
    console.log(stime(this, `.parseScenario: newState =`), setup);
    if (setup.start) {
      const { n: nPlayers, trackSegs } = (setup.start as StartElt)
      TP.numPlayers = nPlayers;
      TP.trackSegs = trackSegs;
      TP.nElts = trackSegs?.length;
      // rebuild scoreTrack:
      this.gamePlay.table.layoutScoreTrack();
      setup = setup.start;
    } else {
      // TP.trackSegs = undefined; // use new random selection
    }

    const { scores, turn, layout, gameState } = setup;
    const map = this.map, gamePlay = this.gamePlay, allPlayers = gamePlay.allPlayers, table = gamePlay.table;
    const turnSet = (turn !== undefined); // indicates a Saved Scenario: assign & place everything
    if (turnSet) {
      gamePlay.turnNumber = turn;
      table.logText(`turn = ${turn}`, `parseScenario`);
      this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }
    // layout or undefined:
    {
      ColCard.makeAllCards(TP.nHexes, TP.mHexes, ); // populate ColCard.cardByName
      this.placeCardsOnMap(layout);
      this.placeMeeplesOnMap(layout);
    }
    // [v, i, v, i]
    if (scores) {
      scores.forEach((viviAry, pid) => {
        const plyr = allPlayers[pid];
        const markers = plyr.markers, counters = plyr.scoreCounters;
        viviAry.forEach(([value, index], i) => markers[i].setValue(value, index))
      })
    }

    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.hexMap.update();
  }

  // TODO: parameterize with savedState (vs permute)
  placeCardsOnMap(layout?: RowElt[]) {
    const gp = this.gamePlay, nr = gp.nRows, nCards = (nr - 2) * gp.nCols;
    const black = BlackCard.allBlack;
    const pCards = ColCard.allCols.slice();
    const dCards = DualCard.allDuals.slice();
    const black0 = black.filter((card, n) => n >= gp.nCols); // row0; rankN
    const blackN = black.filter((card, n) => n < gp.nCols);  // rowN; rank0
    if (layout) {
      layout.forEach((rowElt, row) => {
        const black = row == 0 ? black0 : blackN;
        rowElt.forEach(({ fac }, col) => {
          const cards = (fac.length > 2) ? black : (fac.length == 2) ? dCards : pCards;
          const card = ((fac.length == 2)
            ? cards.find(card => card.factions[0] == fac[0] && card.factions[1] == fac[1])
            : cards.find(card => card.factions[0] == fac[0])) as ColCard;
          removeEltFromArray(card, cards);
          const hex = this.gamePlay.hexMap[row][col];
          card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
          hex.legalMark.doGraphicsDual(card)
        })
      })
      return;
    }

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

  placeMeeplesOnMap(layout?: RowElt[]) {
    const hexMap = this.gamePlay.hexMap, [nrows, ncols] = hexMap.nRowCol;
    if (layout) {
      const allPlayers = this.gamePlay.allPlayers;
      layout.forEach((rowElt, row) => {
        rowElt.forEach(({ meeps }, col) => {
          meeps?.forEach(pid => {
            const player = allPlayers[pid];
            player.makeMeeple(hexMap, 1 + col, nrows - row - 1)
          })
        })
      })
      return;
    }
    // StartElt has no layout: place one each on rank 0
    this.gamePlay.forEachPlayer(player => {
      for (let col = 1; col <= ncols; col++) {
        (player as Player).makeMeeple(hexMap, col); // rank = 0
      }
    })
  }

  override addStateElements(setupElt: SetupElt) {
    const { time, turn } = setupElt;
    const scores = this.gamePlay.allPlayers.map(plyr => plyr.markers.map(m => [m.value, m.track] as [v: number, t: number]))
    const layout = this.gamePlay.getLayout();
    return { turn, scores, time, layout, }
  }

}
