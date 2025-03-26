import { permute, removeEltFromArray, stime } from "@thegraid/common-lib";
import { Player as PlayerLib, ScenarioParser as SPLib, SetupElt as SetupEltLib, StartElt as StartEltLib, Tile, type GamePlay0, type LogWriter, TP as TPLib } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { BlackCard, BlackNull, ColCard } from "./col-card";
import type { ColTable } from "./col-table";
import { type CardContent, type GamePlay } from "./game-play";
import type { HexMap2 } from "./ortho-hex";
import { TP } from "./table-params";

// rowElt.length = nCols
type RowElt = CardContent[];

type SetupEltR = { update?: boolean } & ReturnType<ScenarioParser["addStateElements"]> & SetupEltLib;
export type SetupElt = Partial<SetupEltR>

interface StartElt extends SetupElt, SetupEltLib {
  Aname: string;
  n: number;         // number of players, colored by playerColors[index]
  playerColors?: string[];  // if custom playerColors
  trackSegs: string[];     // name of each TrackSegment
}

export class ScenarioParser extends SPLib {
  declare gamePlay: GamePlay;

  table: ColTable;
  constructor(map: HexMap2, gamePlay: GamePlay) {
    super(map, gamePlay)
    this.table = gamePlay.table; // for stime.anno
  }

  // from gameSetup.parseScenario:
  override parseScenario(setup: SetupElt & { start?: StartElt }) {
    const clog = TP.logFromSubGame || this.gamePlay.table.stage.canvas;
    clog && console.log(stime(this, `.parseScenario: newState =`), setup);
    Tile.gamePlay = this.gamePlay;
    if (setup.start) {
      const { n: nPlayers, trackSegs } = (setup.start as StartElt)
      TPLib.numPlayers = nPlayers;
      TP.trackSegs = trackSegs;
      TP.nElts = trackSegs?.length;
      // rebuild scoreTrack:
      this.gamePlay.table.layoutScoreTrack();
      setup = setup.start;
    } else {
      // TP.trackSegs = undefined; // use new random selection
    }

    const { scores, turn, pStates, layout, gameState, update } = setup;
    const newCards = !update; // newCards -> makeAllCards & Meeples; update -> just move them
    const gamePlay = this.gamePlay, allPlayers = gamePlay.allPlayers, table = gamePlay.table;
    const isGUI = gamePlay.gameState.isGUI
    // validate number of players:
    const n = allPlayers.length, ns = scores?.length ?? n, np = pStates?.length ?? n;
    if ((ns !== n) || (np !== n)) {
      alert(`game-state mismatch: nPlayers=${n}, nScores=${ns}, pStates=${np}`)
      debugger; // TODO launch new gameSetup with n = ???
    }
    const turnSet = (turn !== undefined); // indicates a Saved Scenario: assign & place everything
    if (turnSet) {
      gamePlay.turnNumber = turn;
      table.logText(`turn = ${turn}`, `${isGUI ? 'C ' : 'R '}_parseScenario`);
      newCards && this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }
    // layout or undefined:
    {
      console.log(stime(this, `.parseScenario: newCards=${newCards} layout=`), layout);
      newCards && this.placeCardsOnMap(layout); // for sync, leave cards as they are
      this.placeMeeplesOnMap(layout, newCards); // for sync, do not 'make' new cards
    }
    if (pStates) {
      pStates.forEach((ps, ndx)=> gamePlay.allPlayers[ndx].parseCardStates(ps));
    }
    // [[v, i], [v, i]][]
    if (scores) {
      scores.forEach((viviAry, pid) => {
        const plyr = allPlayers[pid];
        const markers = plyr.markers, counters = plyr.scoreCounters;
        counters.forEach(ctr => ctr.setValue(0));
        if (!markers[0] || !markers[1]) debugger;
        viviAry.forEach(([value, index], i) => markers[i].setValue(value, index))
        markers.forEach(marker => plyr.scoreCount(marker))
      })
    }

    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.table.stage.update();
  }

  makeAllCards(nr = 1, nc = 1) {
    ColCard.nextRadius = CardShape.onScreenRadius; // reset to on-screen size
    Tile.gamePlay = this.gamePlay
    return ColCard.makeAllCards(nr, nc);
  }

  placeCardsOnMap(layout?: RowElt[]) {
    const gamePlay = this.gamePlay, nr = gamePlay.nRows, nc = gamePlay.nCols;
    const { black0, blackN, allCols, allDuals } = this.makeAllCards(nr, nc,);
    if (TP.usePyrTopo) {   // use all 5 columns when nPlayers > 4, nc == 5
      if (TP.numPlayers == 3) {
        black0.splice(2, 1, new BlackNull('Null:3'));
      } else {
        black0.splice(2, 1); // remove colId==C;
      }
      if (nc == 4) {
        blackN.splice(2, 1, new BlackNull('Null:3')); // use only 4 columns, remove 'C'
      }
    }
    gamePlay.black0 = black0.slice();
    gamePlay.blackN = blackN.slice();
    gamePlay.allCols = allCols;   // for printing
    gamePlay.allDuals = allDuals; // for printing
    const pCards = allCols.slice();
    const dCards = allDuals.slice();
    const rank0 = nr - 1;
    if (layout) {
      layout.forEach((rowElt, row) => {
        const black = (row == 0) ? black0 : blackN;
        const hexRow = gamePlay.hexMap[row];
        const c0 = hexRow.findIndex(hex => !!hex);
        rowElt.forEach(({ fac }, ndx) => {
          const col = c0 + ndx;
          const cards = (row == 0 || row == rank0) ? black
              : (row == 1 && nr == 8 && col == 3) ? [new BlackCard(`Fill:${col}`)]
              : (fac.length == 2) ? dCards : pCards;
          const card = ((fac.length == 2)
            ? cards.find(card => card.factions[0] == fac[0] && card.factions[1] == fac[1])
            : cards.find(card => card.factions[0] == fac[0])) as ColCard;
          if (!card) debugger; // ASSERT: cards.includes(card)
          removeEltFromArray(card, cards);
          const hex = hexRow[col];
          card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
          if (!card.hex) debugger;
          hex.legalMark.doGraphicsDual(card)
        })
      })
    } else {
      const nr = gamePlay.nRows
      let nCards = 0;
      gamePlay.hexMap.forEachHex(h => {
        if (h.row !== 0 && h.district !== 0) nCards++; // count ColCard hexes
      });
      // new/random layout:
      permute(pCards)
      permute(dCards)
      const nDual = Math.round(nCards * TP.rDuals), nPlain = nCards - nDual;
      const duals = dCards.slice(0, nDual)
      const plain = pCards.slice(0, nPlain)
      const cards = plain.concat(duals);
      permute(cards);

      gamePlay.hexMap.forEachHex(hex => {
        const { row, col } = hex;
        const card = (row == 1 && nr == 8 && col == 3) ? new BlackCard('Fill:3')
          : (row == 0 ? black0 : row == rank0 ? blackN : cards).shift() as ColCard;
        if (!card) { debugger; }
        card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
        hex.legalMark.doGraphicsDual(card)
        return;
      })
      gamePlay.gameSetup.update()
    }
    return;
  }

  /**
   * First time use make=true, then can sync using make=false.
   * @param layout rowElts with pcids of meeps to place
   * @param newMeeps [true] make new meeples; false -> just move the current meeples
   */
  placeMeeplesOnMap(layout?: RowElt[], newMeeps = true) {
    const gamePlay = this.gamePlay;
    const hexMap = gamePlay.hexMap, nrows = gamePlay.nRows, ncols = gamePlay.nCols;
    const allPlayers = gamePlay.allPlayers;
    if (newMeeps) gamePlay.allMeeples.length = 0; // discard initial/default meeples
    if (layout) {
      layout.forEach((rowElt, row) => {
        const rank = nrows - row - 1;
        const hexRow = this.gamePlay.hexMap[row];
        const c0 = hexRow.findIndex(hex => !!hex);
        rowElt.forEach(({ meeps }, ndx) => {
          const card = hexMap.getCard(rank, c0 + ndx);
          if (!card) debugger;
          card.rmAllMeeps();
          meeps?.forEach((pcids, ndx) => {
            if (!pcids) return; // empty string -> space filler on dual card
            pcids.split('+').forEach(pcid => { // may be other meep in bumpLoc
              const [pnum, colId, ext] = pcid.split(''), pid = Number.parseInt(pnum);
              const player = allPlayers[pid];
              // make or match existing meeple:
              const meep = newMeeps ? player.makeMeeple(colId, ext)
                : player.meeples.find(m => m.pcid == pcid) ?? player.makeMeeple(colId, ext);
                // xtraCol meeples created after makeSubGame(make == true)
              if (!meep) debugger;
              card.addMeep(meep, ndx);
            })
          })
        })
      })
    } else {
      // StartElt has no layout: place one each on rank 0
      allPlayers.forEach(player => {
        this.gamePlay.blackN
          .filter(card => card.factions.length > 0)
          .forEach(card => {
            const meep = player.makeMeeple(card.colId);
            card.addMeep(meep, 0); // rank == 0; black card
          })
      })
    }
    // console.log(stime(this, `.placeMeeplesOnMap: layout=${!!layout}\n`), gamePlay.mapString)
  }
  // override to declare return type:
  override saveState(logWriter?: LogWriter | false): SetupElt {
    return super.saveState(logWriter) as SetupElt; // because addStateElements
  }

  override addStateElements(setupElt: { time: string, turn: number }) {
    const gamePlay = this.gamePlay, turnId = gamePlay.turnId;
    const { time, turn } = setupElt;
    const gameState = gamePlay.gameState.saveState();
    const pStates = gamePlay.getPlayerState();
    const scores = gamePlay.allPlayers.map(plyr => plyr.markers.map(m => [m.value, m.track] as [v: number, t: number]))
    const layout = gamePlay.getLayout();
    return { turn, turnId, time, scores, gameState, pStates, layout, }
  }

}
