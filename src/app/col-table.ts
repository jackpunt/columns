import { permute, Random, type XY, type XYWH } from "@thegraid/common-lib";
import { NamedContainer, ParamGUI, RectShape, type DragInfo, type NamedObject, type ParamItem, type ScaleableContainer } from "@thegraid/easeljs-lib";
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
    super.layoutTable2;
    this.initialVis = false;
    this.addDoneButton();
    this.doneButton.activate(true);
    this.layoutScoreTrack();
    super.layoutTable2(); // update and toggleText
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

  layoutScoreTrack() {
    const scoreTrack = new ScoreTrack(this, this.scaleCont, 16, 20);
    const {x, y, width, height} = this.bgRect.getBounds()
    const bxy = this.bgRect.parent.localToLocal(x + width / 2, height, scoreTrack.parent);
    const { x: tx, y: ty, width: tw, height: th } = scoreTrack.getBounds();
    scoreTrack.x = bxy.x - tx - tw / 2;
  }
}

class ScoreTrack extends NamedContainer {
  factions: number[] = [];
  constructor(public table: ColTable, parent: Container, nElts = 6, dx = 40, ) {
    super('ScoreTrack')
    parent.addChild(this);
    const rgbvsf = [
      'rgbv', 'rgvb', 'rbgv', 'rbvg', 'rvbg', 'rvgb',
      'grbv', 'grvb', 'gbrv', 'gvrb', 'brgv', 'vrgb',
    ];
    const rgbvsr = rgbvsf.map(str => str.split('').reverse().join(''));
    const rgbvs = rgbvsf.concat(rgbvsr)
    const dy = dx * TP.numPlayers, tracks: TrackSegment[] = [], rgbvs2 = rgbvs.slice();
    const rgbv2f: string[] = []; // rgbv2 already used and excluded.
    permute(rgbvs)
    for (let r1 = 0; r1 < rgbvs.length && tracks.length < nElts; r1++) {
      permute(rgbvs2)
      const rgbvs1 = rgbvs[r1];
      const rgbv1 = `${rgbvs1}`
      const e0 = rgbvs1[0], e1 = rgbvs1[1], e2 = rgbvs1[2], e3 = rgbvs1[3];
      // const rgbv2 = `${rgbvs2.find(rgbv => !rgbv2f.includes(rgbv) && (rgbv[0] != e3) && (rgbv[1] !== e2) && (rgbv[2] !== e1) && (rgbv[3] !== e0))}`;
      const rgbv2 = `${rgbv1[1]}${rgbv1[0]}${rgbv1[3]}${rgbv1[2]}`;
      const tseg = new TrackSegment(rgbv1, rgbv2, dx, dy)
      tracks.push(tseg);
      rgbv2f.push(rgbv2)
    }

    permute(tracks)
    const {x, y, width, height} = this.table.bgRect.getBounds()
    tracks.forEach((trk, n) => {
      this.addChild(trk)
      trk.y = y + height + dy
      trk.x = x + n * trk.getBounds().width; // all tracks the same width
    })
  }
}

const rgbvIndex = { 'B': 0, 'r': 1, 'g': 2, 'b': 3, 'v': 4 } // Black, red, gold, blue, violet
type RGBVIndex = typeof rgbvIndex;
type RGBV = keyof RGBVIndex;
/** a segment of the score track; B-rgbv-vbgr-B (where B is half size) */
class TrackSegment extends NamedContainer {
  /**
   * 9 * 12 = 108; 9 * 11 = 99 (end of game)
   * @example
   * Brgbv1-rgbv2B
   * Bvbgr1-vbgr2B
   * @param Aname codes the sequence of each rgbv segment.
   */
  constructor(rgbv1: string, rgbv2: string, dx = 20, dy = 80) {
    super(`${rgbv1}+${rgbv2}`)
    this.setBounds(0, 0, 0, 0);
    const B = ['B'] as RGBV[];
    const ary1 = rgbv1.split('') as RGBV[], ary2 = rgbv2.split('') as RGBV[];
    const factions12 = B.concat(ary1, ary2, B).map(s => rgbvIndex[s]);
    const factions21 = B.concat(ary2, ary1, B).reverse().map(s => rgbvIndex[s]);;
    factions12.forEach((f1, n) => {
      const f2 = factions21[n];
      this.addSlot(f1, f2, { x: dx, y: dy })
    })
    this.factions = [factions12, factions21]
    const {x, y, width, height} = this.getBounds()
    this.cache(x, y, width, height);
  }
  factions;

  addSlot(f1: number, f2: number, dxy: XY) {
    const factionColor = (faction: number) => ColCard.factionColors[faction];
    const dxyy = dxy.y, dxyx = (f1 == 0) ? dxy.x / 2 : dxy.x;
    const { x: x0, y: y0, width, height } = this.getBounds(); // expect x0 = 0, y0 = height/2
    const c1 = factionColor(f1), c2 = factionColor(f2);
    const rect1 = new RectShape({ s: 1, x: x0 + width, w: dxyx, h: dxyy, y: y0 }, c1, );
    const rect2 = new RectShape({ s: 1, x: x0 + width, w: dxyx, h: dxyy, y: y0 + height - dxyy }, c2, );
    this.addChild(rect1)
    this.addChild(rect2)
    this.setBoundsNull(); // so createjs will compute containers bounds from children.
  }
}
