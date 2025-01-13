import { stime } from '@thegraid/common-lib';
import { GameSetup as GameSetupLib, H, MapCont, Scenario as Scenario0, Table, TP, type HexAspect } from '@thegraid/hexlib';
import { GamePlay } from './game-play';
import { CardHex, ColCard } from './col-card';
import { OrthoHex as Hex1, OrthoHex2 as Hex2, HexMap2 } from './ortho-hex';
import { ColTable } from './col-table';
import { Player } from './player';
import { TileExporter } from './tile-exporter';

// type Params = {[key: string]: any;}; // until hexlib supplies
export interface Scenario extends Scenario0 {

};

type PublicInterface<T> = { [K in keyof T]: T[K] };
declare global {
  interface Math {
    sum(...ary: number[]): number;
    // because 'Date' is not a class, it's tricky to define Date.stime
    // but it's easy to attach it to Math:
    stime: (typeof stime) & PublicInterface<typeof stime>;
  }
}
Math.sum = (...ary: number[]) => ary.reduce((pv, cv) => pv + cv, 0);
Math.stime = stime; // can use Math.stime() in js/debugger

/** initialize & reset & startup the application/game. */
export class GameSetup extends GameSetupLib {
  declare table: ColTable;

  override startup(qParams?: { [x: string]: any; }): void {
    // TODO: place all ColCards
    ColCard.nextRadius = ColCard.onScreenRadius; // reset for on-screen PathCard
    super.startup(qParams)
  }

  // allow qParams as opt arg:
  override initialize(canvasId: string, qParams = this.qParams): void {
    window.addEventListener('contextmenu', (evt: MouseEvent) => evt.preventDefault())
    // useEwTopo, size 7.
    const { host, port, file, nH } = qParams;
    TP.useEwTopo = true;
    TP.nHexes = nH || 7;
    TP.ghost = host || TP.ghost
    TP.gport = Number.parseInt(port || TP.gport.toString(10), 10)
    TP.networkGroup = 'hexpath:game1';
    TP.networkUrl = TP.buildURL(undefined);
    super.initialize(canvasId);
    let rfn = document.getElementById('readFileName') as HTMLInputElement;
    rfn.value = file ?? 'setup@0';

    return;
  }

  tileExporter = new TileExporter(); // enable 'Make Pages' buttons

  update() {
    const hexCont = this.hexMap.mapCont?.hexCont;
    hexCont?.cacheID && hexCont.updateCache()  // when toggleText: hexInspector
    hexCont?.stage?.update();
  }
  override makeHexMap() {
    const hexMap = new HexMap2(TP.hexRad, true, Hex2);
    const cNames = MapCont.cNames.concat() as string[]; // for example
    hexMap.addToMapCont(Hex2, cNames);       // addToMapCont(hexC, cNames)
    hexMap.makeAllDistricts();               // determines size for this.bgRect
    return hexMap;
  }

  override makeTable(): Table {
    return new ColTable(this.stage);
  }

  override makeGamePlay(scenario: Scenario): GamePlay {
    return new GamePlay(this, scenario);
  }

  override makePlayer(ndx: number, gamePlay: GamePlay) {
    return new Player(ndx, gamePlay);
  }

  override startScenario(scenario: Scenario0) {
    const gp = super.startScenario(scenario)
    const cmh = this.table.hexMap.cardMarkHexes;
    cmh.splice(0, cmh.length, ...CardHex.allCardHex)
    return gp
  }
  /** demo for bringup visualization */
  placeCardsOnMap() {
    this.hexMap.forEachHex(hex => {
      const card = ColCard.source.takeUnit();
      card?.placeTile(hex as Hex1);
      return;
    })
    this.update()
    return;
  }
}
