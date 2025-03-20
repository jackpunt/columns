import { permute, removeEltFromArray, stime } from "@thegraid/common-lib";
import { Player as PlayerLib, ScenarioParser as SPLib, SetupElt as SetupEltLib, StartElt as StartEltLib, Tile, type GamePlay0, type LogWriter } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { BlackNull, ColCard } from "./col-card";
import type { ColTable } from "./col-table";
import { type CardContent, type GamePlay } from "./game-play";
import type { HexMap2 } from "./ortho-hex";
import { TP } from "./table-params";

// rowElt.length = nCols
type RowElt = CardContent[];

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
      table.logText(`turn = ${turn}`, `${isGUI ? ' C ' : ' R '}parseScenario`);
      this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }
    // layout or undefined:
    {
      this.placeCardsOnMap(layout);
      this.placeMeeplesOnMap(layout);
      if (TP.usePyrTopo && n < 4) {
        // Shift top row right to align with top-rank; add links(SE,S,SW)
        const hexMap = gamePlay.hexMap;
        const { w, dxdc } = hexMap.topo.xywh(TP.hexRad, 0, 0);
        const black0 = gamePlay.cardsInRow(0);
        black0.forEach(card => {
          card.x += dxdc * .5;
          card.hex.cont.visible = false;
          const r0Hex = card.hex;
          const seHex = r0Hex.nextHex('SE');
          r0Hex.links['SW'] = r0Hex.links['S'] = seHex;
          seHex.links['NW'] = seHex.links['N'] = r0Hex;
        })
      }
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
    if (TP.usePyrTopo && nc == 4) {
      black0.splice(2, 1); // use all 5 columns when nPlayers > 4
      blackN.splice(2, 1, new BlackNull('Null:3')); // use only 4 columns
    }
    gamePlay.black0 = black0.slice();
    gamePlay.blackN = blackN.slice();
    gamePlay.allCols = allCols;   // for printing
    gamePlay.allDuals = allDuals; // for printing
    const pCards = allCols.slice();
    const dCards = allDuals.slice();
    if (layout) {
      layout.forEach((rowElt, row) => {
        const black = (row == 0) ? black0 : blackN;
        const hexRow = this.gamePlay.hexMap[row];
        const c0 = hexRow.findIndex(hex => !!hex);
        rowElt.forEach(({ fac }, ndx) => {
          const col = c0 + ndx;
          const cards = (fac.length > 2) ? black : (fac.length == 2) ? dCards : pCards;
          const card = ((fac.length == 0) ? new BlackNull(`Null:${col}`, col)
            : (fac.length == 2)
            ? cards.find(card => card.factions[0] == fac[0] && card.factions[1] == fac[1])
            : cards.find(card => card.factions[0] == fac[0])) as ColCard;
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

      const rank0 = nr - 1;
      this.gamePlay.hexMap.forEachHex(hex => {
        const row = hex.row;
        const card = (row == 0 ? black0 : row == rank0 ? blackN : cards).shift() as ColCard;
        if (!card) { debugger; }
        card.moveTo(hex); // ASSERT: each Hex has a Card, each Card is on a Hex.
        hex.legalMark.doGraphicsDual(card)
        return;
      })
      this.gamePlay.gameSetup.update()
    }
    return;
  }

  placeMeeplesOnMap(layout?: RowElt[]) {
    const gamePlay = this.gamePlay;
    const hexMap = gamePlay.hexMap, nrows = gamePlay.nRows, ncols = gamePlay.nCols;
    const allPlayers = gamePlay.allPlayers;
    gamePlay.allMeeples.length = 0; // discard initial/default meeples
    if (layout) {
      layout.forEach((rowElt, row) => {
        const rank = nrows - row - 1;
        const hexRow = this.gamePlay.hexMap[row];
        const c0 = hexRow.findIndex(hex => !!hex);
        rowElt.forEach(({ meeps }, ndx) => {
          const col = c0 + ndx;
          meeps?.forEach((pcid, ndx) => {
            if (!pcid) return; // empty string -> space filler on dual card
            pcid.split('+').forEach(pcid => { // may be other meep in bumpLoc
              const [pnum, colId, ext] = pcid.split(''), pid = Number.parseInt(pnum);
              const player = allPlayers[pid];
              const meep = player.makeMeeple(`${colId}${ext ?? ''}`); // label on reload
              const card = hexMap.getCard(rank, col);
              card.addMeep(meep, ndx);
            })
          })
        })
      })
    } else {
      // StartElt has no layout: place one each on rank 0
      allPlayers.forEach(player => {
        this.gamePlay.cardsInRow(nrows - 1)
          .filter(card => card.factions.length > 0)
          .forEach(card => {
            if (card.factions.length == 0) return;
            const meep = player.makeMeeple(card.col);
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
