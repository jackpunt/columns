import { type XY, type XYWH } from "@thegraid/common-lib";
import { ParamGUI, type DragInfo, type NamedObject, type ParamItem, type ScaleableContainer } from "@thegraid/easeljs-lib";
import { Stage, type Container, type DisplayObject } from "@thegraid/easeljs-module";
import { Hex2, Table, Tile, TileSource, type DragContext, type IHex2 } from "@thegraid/hexlib";
import { ColCard } from "./col-card";
import type { GamePlay } from "./game-play";
import type { GameSetup, Scenario } from "./game-setup";
import { type HexMap2, type OrthoHex2 } from "./ortho-hex";
import { TP } from "./table-params";

export class ColTable extends Table {
  constructor(stage: Stage) {
    super(stage);
    this.dragger.dragCont.scaleX = this.dragger.dragCont.scaleY = 1.6;
    this.initialVis = true;
  }
  declare gamePlay: GamePlay;
  declare hexMap: HexMap2;    // From gamePlay.hexMap
  // return type declaration:
  override hexUnderObj(dragObj: DisplayObject, legalOnly?: boolean) {
    return super.hexUnderObj(dragObj, legalOnly) as OrthoHex2 | undefined;
  }
  /** min panel height + gap */
  mph_g = 2.7;

  get nRows() { return this.gamePlay.nRows }
  get nCols() { return this.gamePlay.nCols }

  // bgRect tall enough for (3 X mph + gap) PlayerPanels
  override bgXYWH(x0?: number, y0?: number, w0 = this.panelWidth * 2 + 1, h0 = .2, dw?: number, dh?: number): { x: number; y: number; w: number; h: number; } {
    const nr = this.nRows
    const h1 = Math.max(nr, 3 * this.mph_g) - nr; // extra height beyond nr + h0
    return super.bgXYWH(x0, y0, w0, h0 + h1, dw, dh)
  }

  override layoutTable(gamePlay: GamePlay): void {
    const { table, hexMap, gameSetup } = gamePlay;
    super.layoutTable(gamePlay);
  }
  override makePerPlayer(): void {
    super.makePerPlayer();
  }
  get super_panelHeight() { return this.nRows / 3 - .2; }
  override get panelHeight() { return Math.max(this.super_panelHeight, this.mph_g - .2) }

  // getPanelLocs adapted for makeRect()
  override getPanelLocs() {
    const { nh: nr, mh: nc } = this.hexMap.getSize();
    const rC = (nr - 1) / 2;
    const cC = (nc - 1) / 2;
    const coff = (nc / 2) + (this.panelWidth / 2) + .2;
    const ph = this.panelHeight + .2;
    // Left of map (dir: +1), Right of map (dir: -1)
    const cL = cC - coff, cR = cC + coff;
    const locs: [row: number, col: number, dir: 1 | -1][] = [
        [rC - ph, cL, +1], [rC, cL, +1], [rC + ph, cL, +1],
        [rC - ph, cR, -1], [rC, cR, -1], [rC + ph, cR, -1]
    ];
    return locs;
  }

  // override layoutTurnlog(rowy = 0, colx = -14): void {
  //   super.layoutTurnlog(rowy, colx)
  // }
  override toggleText(vis = !this.isVisible): void {
    this.newHexes.forEach(hex => hex.showText(vis))
    super.toggleText(vis);
  }

  makeSourceAtRowCol<T extends Tile>(ms: (hex: Hex2) => TileSource<T>,
    name = 'tileSource', row = 1, col = 1, counterXY?: Partial<XY>,
    hexC = this.hexC,
  ) {
    const hex = this.newHex2(row, col, name, hexC) as IHex2;
    this.setToRowCol(hex.cont, row, col); // on hexCont!??
    const source = ms(hex);
    source.permuteAvailable();
    const { x: dx, y: dy } = { ... { x: .5, y: .5 }, ...counterXY }
    const { x, y, width, height } = hex.cont.getBounds()
    source.counter.x = hex.cont.x + (x + dx * width);
    source.counter.y = hex.cont.y + (y + dy * height);
    hex.distText.y = 0;
    return source;
  }

  override layoutTable2() {
    this.initialVis = false;
    super.layoutTable2();
    this.addDoneButton();
    this.doneButton.activate(true);
    return;
  }

  cardSource!: TileSource<ColCard>
  cardDiscard!: TileSource<ColCard>

  override get panelWidth() { return Math.max(4, this.nCols) * .5; } // (2.5 / 3.5 * .7) = .5 (* hexRad)

  override doneClicked(evt?: any, data?: any): void {
    super.doneClicked(evt, data); // vis=false; phaseDone(data)
  }

  override panelLocsForNp(np: number): number[] {
    return [[], [0], [0, 2], [0, 3, 2], [0, 3, 5, 2], [0, 3, 4, 5, 2], [0, 3, 4, 5, 2, 1]][np];
  }

  /** identify dragTile so it can be rotated by keybinding */
  get dragTile(): ColCard | undefined {
    const dragging = this.isDragging;
    return (dragging instanceof ColCard) ? dragging : undefined;
  }

  override startGame(scenario: Scenario) {
    super.startGame(scenario);         // allTiles.makeDragable(); setNextPlayer()
    this.gamePlay.gameState.start();   // gamePlay.phase(startPhase); enable GUI to drive game
  }

  override layoutTurnlog(rowy?: number, colx?: number): void {
    const row2 = rowy ?? Math.min(-.5, this.nRows - 7.5) + 3.5;
    const col2 = colx ?? (-1.8 - this.nCols * .5) - 4;
    super.layoutTurnlog(row2, col2)
  }
  override setupUndoButtons(bgr: XYWH, row?: number, col?: number, undoButtons?: boolean, xOffs?: number, bSize?: number, skipRad?: number): void {
    const row2 = row ?? Math.min(-.5, this.nRows - 7.5);
    const col2 = col ?? -1.8 - this.nCols * .5;
    super.setupUndoButtons(bgr, row2, col2, undoButtons, xOffs, bSize, skipRad)
  }
  override bindKeysToScale(scaleC: ScaleableContainer, ...views: (XY & { scale: number; isk: string; ssk?: string; })[]): void {
    const viewA = { x: 500, y: 2, scale: .5, isk: 'a'}
    const viewZ = { x: 350, y: 2, scale: 0.647, isk: 'z', ssk: 'x' };
    super.bindKeysToScale(scaleC, viewA, viewZ);
  }

  override markLegalHexes(tile: Tile, ctx: DragContext): number {
    return super.markLegalHexes(tile, ctx);  // return super()+1 to allow everything to drag
  }

  // debug copy; do not keep
  override dragFunc(tile: Tile, info: DragInfo) {
    const hex = this.hexUnderObj(tile); // clickToDrag 'snaps' to non-original hex!
    this.dragFunc0(tile, info, hex);
  }

  override makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right' });
    gui.name = (gui as NamedObject).Aname = 'ParamGUI';
    const gameSetup = this.gamePlay.gameSetup as GameSetup;
    gui.makeParamSpec('hexRad', [30, 45, 60, 90,], { fontColor: 'red' }); TP.hexRad;
    gui.spec('hexRad').onChange = (item: ParamItem) => {
      gameSetup.restart({ hexRad: item.value })
    }
    gui.makeParamSpec('numPlayers', [2, 3, 4, 5, 6, 7, 8, 9,], { fontColor: 'red', name: 'nPlayers' }); TP.numPlayers;
    gui.spec('numPlayers').onChange = (item: ParamItem) => {
      gui.setInheritedValue(item);
      gameSetup.restart({});
    }
    gui.makeParamSpec('rDuals', [0, .1, .2, .3], { fontColor: 'red' }); TP.rDuals;
    gui.spec('rDuals').onChange = (item: ParamItem) => {
      gui.setValue(item);
      gameSetup.restart({})
    }

    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines();
    return gui
    }
}
