import { permute, removeEltFromArray, stime } from "@thegraid/common-lib";
import { Player as PlayerLib, ScenarioParser as SPLib, SetupElt as SetupEltLib, StartElt as StartEltLib, Tile, type GamePlay0, type LogWriter } from "@thegraid/hexlib";
import { BlackCard, ColCard, DualCard } from "./col-card";
import { arrayN, type Faction, type GamePlay } from "./game-play";
import { Player } from "./player";
import { TP } from "./table-params";

// rowElt.length = nCols
type RowElt = { fac: Faction[], meeps?: number[] }[];

type SetupEltR = ReturnType<ScenarioParser["addStateElements"]> & SetupEltLib;
export type SetupElt = Partial<SetupEltR>

interface StartElt extends SetupElt, SetupEltLib {
  Aname: string;
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

    const { scores, turn, pStates, layout, gameState } = setup;
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
    if (pStates) {
      pStates.forEach((ps, ndx)=> gamePlay.allPlayers[ndx].parseCardStates(ps));
    }
    // [v, i, v, i]
    if (scores) {
      scores.forEach((viviAry, pid) => {
        const plyr = allPlayers[pid];
        const markers = plyr.markers, counters = plyr.scoreCounters;
        if (!markers[0] || !markers[1]) debugger;
        viviAry.forEach(([value, index], i) => markers[i].setValue(value, index))
      })
    }

    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.hexMap.update();
  }

  placeCardsOnMap(layout?: RowElt[]) {
    const gp = this.gamePlay
    const black = BlackCard.allBlack;
    const pCards = ColCard.allCols.slice();
    const dCards = DualCard.allDuals.slice();
    const black0 = black.filter((card, n) => n >= gp.nCols); // row0; rankN
    const blackN = black.filter((card, n) => n < gp.nCols);  // rowN; rank0
    if (layout) {
      layout.forEach((rowElt, row) => {
        const black = (row == 0) ? black0 : blackN;
        rowElt.forEach(({ fac }, col) => {
          const cards = (fac.length > 2) ? black : (fac.length == 2) ? dCards : pCards;
          const card = ((fac.length == 2)
            ? cards.find(card => card.factions[0] == fac[0] && card.factions[1] == fac[1])
            : cards.find(card => card.factions[0] == fac[0])) as ColCard;
          removeEltFromArray(card, cards);
          const hex = this.gamePlay.hexMap[row][col + 1];
          card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
          hex.legalMark.doGraphicsDual(card)
        })
      })
      return;
    } else {
      const nr = gp.nRows, nCards = (nr - 2) * gp.nCols;
      // new/random layout:
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
  }

  placeMeeplesOnMap(layout?: RowElt[]) {
    const gamePlay = this.gamePlay;
    const hexMap = gamePlay.hexMap, [nrows, ncols] = hexMap.nRowCol;
    const allPlayers = gamePlay.allPlayers;
    gamePlay.allMeeples.length = 0; // discard initial/default meeples
    if (layout) {
      Tile.gamePlay = gamePlay; // so Meeples can find their GamePlay
      layout.forEach((rowElt, row) => {
        rowElt.forEach(({ meeps }, col) => {
          meeps?.forEach(pid => {
            const player = allPlayers[pid];
            player.makeMeeple(hexMap, 1 + col, nrows - row - 1)
          })
        })
      })
    } else {
      // StartElt has no layout: place one each on rank 0
      allPlayers.forEach(player => {
        arrayN(ncols).forEach(col => {
          player.makeMeeple(hexMap, 1 + col, 0); // rank = 0
        })
      })
    }
    // console.log(stime(this, `.placeMeeplesOnMap: layout=${!!layout}\n`), gamePlay.mapString)
  }
  // override to declare return type:
  override saveState(gamePlay?: GamePlay0, logWriter?: LogWriter | false): SetupElt {
    return super.saveState(gamePlay, logWriter) as SetupElt; // because addStateElements
  }

  override addStateElements(setupElt: {time: string, turn: number}) {
    const { time, turn } = setupElt;
    const gameState = this.gamePlay.gameState.saveState();
    const pStates = this.gamePlay.getPlayerState();
    const scores = this.gamePlay.allPlayers.map(plyr => plyr.markers.map(m => [m.value, m.track] as [v: number, t: number]))
    const layout = this.gamePlay.getLayout();
    return { turn, time, scores, gameState, pStates, layout, }
  }

}
