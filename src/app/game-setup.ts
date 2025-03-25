import { C, stime, type Constructor } from '@thegraid/common-lib';
import { makeStage, type NamedObject } from '@thegraid/easeljs-lib';
import { AliasLoader, GameSetup as GameSetupLib, HexMap, LogWriter, MapCont, Player as PlayerLib, Scenario as Scenario0, type Hex, type HexAspect, TP as TPLib } from '@thegraid/hexlib';
import { CardShape } from './card-shape';
import { ColCard } from './col-card';
import { ColTable } from './col-table';
import { arrayN, GamePlay } from './game-play';
import { ColHex2 as Hex2, HexMap2 } from './ortho-hex';
import { Player, SubPlayer } from './player';
import { ScenarioParser, type SetupElt } from './scenario-parser';
import { TP } from './table-params';
import { TileExporter } from './tile-exporter';

type Params = Record<string, any>; // until hexlib supplies
export interface Scenario extends Scenario0 {
  nPlayers?: number;
};

/** initialize & reset & startup the application/game. */
class ColGameSetup extends GameSetupLib {
  declare table: ColTable;
  declare gamePlay: GamePlay;
  declare scenarioParser: ScenarioParser;
  declare startupScenario: SetupElt;

  /** current/most-recent GameSetup running with a canvasId. */
  static gameSetup: GameSetup;
  constructor(canvasId?: string, qParam?: Params) {
    super(canvasId, qParam)
  }

  tileExporter = new TileExporter(); // enable 'Make Pages' buttons

  override initialize(canvasId: string): void {
    if (canvasId) GameSetup.gameSetup = this;
    // for hexmarket to bringup their own menus:
    window.addEventListener('contextmenu', (evt: MouseEvent) => evt.preventDefault())
    console.log(stime(this, `---------------------   GameSetup.initialize  ----------------`))
    super.initialize(canvasId)
    return;
  }

  override loadImagesThenStartup() {
    AliasLoader.loader.fnames = ['meeple-shape'];
    super.loadImagesThenStartup();    // loader.loadImages(() => this.startup(qParams));
  }

  override startup(scenario: Scenario): void {
    ColCard.nextRadius = CardShape.onScreenRadius; // reset to on-screen size
    super.startup(scenario)
  }

  update() {
    const hexCont = this.hexMap.mapCont?.hexCont;
    hexCont?.cacheID && hexCont.updateCache()  // when toggleText: hexInspector
    hexCont?.stage?.update();
  }

  /** compute nRows & nCols for nPlayers; set TP.nHexes = nr & TP.mHexes = nc */
  setRowsCols(np = TP.numPlayers) {
    let nr = TP.nHexes, nc = TP.mHexes, nElts = TP.nEltsPerPlayer[np];
    let tc = 0;
    if (TP.usePyrTopo) {
      // [5],6,7,6,5,4,3,[4] np>=4
      // [5],6,7,6,5,4,[5]   np==3
      // [5],6,5,4,3,[4]     np==2
      nr = [4, 4, 4, 5, 6, 6, 6, 6, 6, 6][np] + 2; // include 2 black rows
      nc = (np <= 4) ? 4 : 5;
      tc = (np == 2) ? 18 : (np == 3 ? 28 : 31); // 18 for np=2
    } else {
      // nr includes top & bottom black cells;
      nr = [4, 4, 4, 4, 5, 5, 5, 5, 6, 6][np] + 2; // include 2 black rows
      nc = [4, 4, 4, 4, 5, 5, 6, 6, 7, 7][np];
      tc = (nr - 2) * nc;
      //    np =  0  1  2  3  4  5  6  7  8  9
      //    score      40 50 60 72 84 98 112 128  (nr+1)*(nc+1)*2
    }
    TP.setParams({ nHexes: nr, mHexes: nc, }, false, TPLib)
    TP.setParams({ cardsInPlay: tc, nElts }, false, TP)
    return [nr, nc] as [nr: number, nc: number];
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
    return new ColTable(this.stage);
  }

  override makeGamePlay(scenario: Scenario): GamePlay {
    return new GamePlay(this, scenario); // sure, we could specialize here (recordMeep)
  }

  override makePlayer(ndx: number, gamePlay: GamePlay) {
    return new Player(ndx, gamePlay);
  }

  override resetState(stateInfo: Scenario & HexAspect): void {
    const n = stateInfo.nPlayers ?? `${TP.numPlayers}`;   // convert {nPlayers: 3} --> {n: 3}
    this.qParams = { ...this.qParams, n };  // qParams from ng is readonly
    super.resetState(stateInfo);
  }

  override startScenario(scenario: Scenario0) {
    const gp = super.startScenario(scenario)
    return gp
  }
}

export class PyrGameSetup extends ColGameSetup {
  declare gamePlay: GamePlay;

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

}

/** GameSetup with no canvas, using gs.logWriter, same ImageLoader.
 * All Players are auto/robotic SubPlayer.
 */
export class SubGameSetup extends ColGameSetup {
  /**
   * @param gs the original/actual running GameSetup, GameState, Players, Table, etc
   */
  constructor(public gs: GameSetup, scenario: Scenario = gs.qParams) {
    super(undefined, scenario);
    // makeLogWriter is invoked by super, *before* gs is available, so overwrite here:
    (this as any).logWriter = new SubGameLogWriter(gs.logWriter);
    this.startup(this.qParams);
  }
  override initialize(canvasId: string): void {
    const Aname = this.qParams['Aname']
    console.log(stime(this, `------- new PlayerGameSetup: ${Aname} ${canvasId ?? 'robo'} --------`))
    this.stage = makeStage(canvasId, false);
    PlayerLib.logNewPlayer = (plyr: PlayerLib) => {
      if (plyr.gamePlay.table.stage.canvas) {
        console.log(stime(plyr, `.new:`), plyr.Aname);
      }
    }
  }
  override makeLogWriter() { return undefined; }

  override loadImagesThenStartup(scenario: Scenario = this.qParams): void {
    // do NOT create new loader:
    const msImage = AliasLoader.loader.getImage('meeple-shape'); // just to show we can
    // setTimeout(() => this.startup(scenario), 0); // new task
    this.startup(scenario)
  }

  override makePlayer(ndx: number, gamePlay: GamePlay) {
    const plyr = new SubPlayer(ndx, gamePlay);
    (plyr as NamedObject).Aname = `${plyr.Aname} R `;
    return plyr;
  }
  override startGame(): void {
    this.table.startGame();
    this.gamePlay.gameState.start('Idle')
    return; // try DO NOT START the GUI
  }
}

/** maybe log selected lines... */
class SubGameLogWriter extends LogWriter {
  constructor(public gsLogwriter?: LogWriter) {
    super()
    this.writeLine()
  }
  override writeLine(text?: string): void {
    // if (!text?.startsWith('// ')) this.gsLogwriter.writeLine(text);
  }
}
export class GameSetup extends ColGameSetup {

}
