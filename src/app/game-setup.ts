import { C, stime, type Constructor } from '@thegraid/common-lib';
import { AliasLoader, GameSetup as GameSetupLib, HexMap, MapCont, Scenario as Scenario0, TP, type Hex, type HexAspect, type LogWriter, type SetupElt as SetupEltLib } from '@thegraid/hexlib';
import { CardShape } from './card-shape';
import { ColCard } from './col-card';
import { ColTable } from './col-table';
import { arrayN, GamePlay } from './game-play';
import { OrthoHex2 as Hex2, HexMap2 } from './ortho-hex';
import { PlayerB } from './player';
import { ScenarioParser, type SetupElt } from './scenario-parser';
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
// TODO: move to common-lib:
Math.sum = (...ary: number[]) => ary.reduce((pv, cv) => pv + cv, 0);
Math.stime = stime; // can use Math.stime() in js/debugger

/** initialize & reset & startup the application/game. */
export class GameSetup extends GameSetupLib {
  declare table: ColTable;
  declare scenarioParser: ScenarioParser;
  declare startupScenario: SetupElt;
  constructor(canvasId?: string, qParam?: Params) {
    super(canvasId, qParam)
  }

  tileExporter = new TileExporter(); // enable 'Make Pages' buttons

  override initialize(canvasId: string): void {
    // for hexmarket to bringup their own menus:
    window.addEventListener('contextmenu', (evt: MouseEvent) => evt.preventDefault())
    super.initialize(canvasId)
    return;
  }

  override loadImagesThenStartup() {
    AliasLoader.loader.fnames = ['meeple-shape'];
    super.loadImagesThenStartup();    // loader.loadImages(() => this.startup(qParams));
  }

  override startup(scenario: Scenario): void {
    ColCard.nextRadius = CardShape.onScreenRadius; // reset for on-screen PathCard
    super.startup(scenario)
  }

  update() {
    const hexCont = this.hexMap.mapCont?.hexCont;
    hexCont?.cacheID && hexCont.updateCache()  // when toggleText: hexInspector
    hexCont?.stage?.update();
  }

  /** compute nRows & nCols for nPlayers; set TP.nHexes = nr & TP.mHexes = nc */
  setRowsCols(nPlayers = TP.numPlayers) {
    // nr includes top & bottom black cells; (8 player could be 7 rows...)
    const nr = Math.max(4, 3 + Math.floor(nPlayers / 2)) + 2; // include 2 black rows
    const nc = Math.max(4, 2 + Math.ceil(nPlayers / 2));
    // const nr = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7][np] + 2;
    // const nc = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7][np];
    //       np =  0  1  2  3  4  5  6  7  8  9
    // score            40 50 60 72 84 98 112 128  (nr+1)*(nc+1)*2
    TP.nHexes = nr;
    TP.mHexes = nc;
    return [nr, nc] as [number, number];
  }

  override makeHexMap(
    hexMC: Constructor<HexMap<Hex>> = HexMap2,
    hexC: Constructor<Hex> = Hex2, // (radius, addToMapCont, hexC, Aname)
    cNames = MapCont.cNames.concat() as string[], // the default layers
  ) {
    const [nr] = this.setRowsCols();
    // set color of 'hex' for each row (district); inject to HexMap.distColor
    const dc = arrayN(nr).map(i => C.grey224);
    HexMap.distColor.splice(0, HexMap.distColor.length, ...dc);
    const hexMap = super.makeHexMap(hexMC, hexC, cNames); // hexMap.makeAllHexes(nh=TP.nHexes, mh=TP.mHexes)
    return hexMap;
  }

  override makeTable(): ColTable {
    return new ColTable(this.stage); // TODO: update makeStage()
  }

  override makeGamePlay(scenario: Scenario): GamePlay {
    return new GamePlay(this, scenario);
  }

  override makePlayer(ndx: number, gamePlay: GamePlay) {
    return new PlayerB(ndx, gamePlay);
  }

  override resetState(stateInfo: Scenario & HexAspect): void {
    const n = stateInfo.nPlayers;   // convert {nPlayers: 3} --> {n: 3}
    this.qParams = { ...this.qParams, n};  // qParams from ng is readonly
    super.resetState(stateInfo);
  }

  override startScenario(scenario: Scenario0) {
    const gp = super.startScenario(scenario)
    return gp
  }
}


/** GameSetup with no canvas, using gs.logWriter, same loader */
export class PlayerGameSetup extends GameSetup {
  /**
   * @param gs the original/actual running GameSetup, GameState, Players, Table, etc
   */
  constructor(public gs: GameSetup, scenario: Scenario = {}) {
    super(undefined, gs.qParams)
    ;(this as any).logWriter = gs.logWriter;
  }
  override makeLogWriter() { return {} as LogWriter; }

  override loadImagesThenStartup(scenario: Scenario = this.qParams): void {
    // do NOT create new loader:
    const msImage = AliasLoader.loader.getImage('meeple-shape'); // just to show we can
    setTimeout(() => this.startup(scenario), 0); // new task
  }

  sync() {
    // get state of real game:
    const stateInfo = this.gs.scenarioParser.saveState();
    // push into this subGame:
    this.scenarioParser.parseScenario(stateInfo); // parse into this game
  }
}
