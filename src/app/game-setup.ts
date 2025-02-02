import { C, stime, type Constructor } from '@thegraid/common-lib';
import { AliasLoader, GameSetup as GameSetupLib, HexMap, MapCont, Scenario as Scenario0, Table, TP, type Hex, type HexAspect } from '@thegraid/hexlib';
import { CardHex, ColCard } from './col-card';
import { ColTable } from './col-table';
import { GamePlay } from './game-play';
import { OrthoHex2 as Hex2, HexMap2 } from './ortho-hex';
import { Player } from './player';
import { ScenarioParser } from './scenario-parser';
import { TileExporter } from './tile-exporter';

type Params = Record<string, any>; // until hexlib supplies
export interface Scenario extends Scenario0 {
  nPlayers?: number;
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
  override loadImagesThenStartup(qParams: Params = {}) {
    AliasLoader.loader.fnames = ['meeple-shape'];
    super.loadImagesThenStartup(qParams);    // loader.loadImages(() => this.startup(qParams));
  }
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

  override makeHexMap(
    hexMC: Constructor<HexMap<Hex>> = HexMap2,
    hexC: Constructor<Hex> = Hex2, // (radius, addToMapCont, hexC, Aname)
    cNames = MapCont.cNames.concat() as string[], // the default layers
  ) {
    const np = this.getNPlayers();
    // nr includes top & bottom black cells; (8 player could be 7 rows...)
    const nr = Math.max(4, 3 + Math.floor(np / 2)) + 2; // include 2 black rows
    const nc = Math.max(4, 2 + Math.ceil(np / 2));
    // const nr = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7][np] + 2;
    // const nc = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7][np];
    //       np =  0  1  2  3  4  5  6  7  8  9
    // score            40 50 60 72 84 98 112 128  (nr+1)*(nc+1)*2
    // set color of 'hex' for each row:
    const dc = Array<string>(nr); dc.fill(C.grey224, 0, -1); dc[0] = dc[nr-1] = C.grey64;
    HexMap.distColor.splice(0, HexMap.distColor.length, ...dc);
    TP.nHexes = nr;
    TP.mHexes = nc;
    const hexMap = super.makeHexMap(hexMC, hexC, cNames); // hexMap.makeAllHexes(nh=TP.nHexes, mh=TP.mHexes)
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

  override resetState(stateInfo: Scenario & HexAspect): void {
    const n = stateInfo.nPlayers;
    this.qParams = { ...this.qParams, n};  // qParams from ng is readonly
    super.resetState(stateInfo);
  }

  override makeScenarioParser(hexMap: HexMap<Hex>, gamePlay: GamePlay): ScenarioParser {
    return new ScenarioParser(hexMap, gamePlay)
  }

  override startScenario(scenario: Scenario0) {
    const gp = super.startScenario(scenario)
    const cmh = this.table.hexMap.cardMarkHexes;
    cmh.splice(0, cmh.length, ...CardHex.allCardHex)
    return gp
  }
}
