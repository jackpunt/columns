import { C, permute, removeEltFromArray, S, stime, type XY, type XYWH } from "@thegraid/common-lib";
import { afterUpdate, CircleShape, NamedContainer, PaintableShape, ParamGUI, RectShape, TextInRect, type CountClaz, type GridSpec, type ParamItem, type ScaleableContainer } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Shape, Stage } from "@thegraid/easeljs-module";
import { Hex2, Table, Tile, TileSource, type DragContext, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ColCard } from "./col-card";
import type { ColMeeple } from "./col-meeple";
import { type Faction, type GamePlay } from "./game-play";
import { type HexMap2, type ColHex2 } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";

export class ColTable extends Table {
  constructor(stage: Stage) {
    super(stage);
    this.dragger.dragCont.scaleX = this.dragger.dragCont.scaleY = 1//.6;
    this.initialVis = true;
  }
  declare gamePlay: GamePlay;
  declare hexMap: HexMap2;    // From gamePlay.hexMap
  // return type declaration:
  override hexUnderObj(dragObj: DisplayObject, legalOnly?: boolean) {
    return super.hexUnderObj(dragObj, legalOnly) as ColHex2 | undefined;
  }
  /** min panel height + gap */
  mph_g = 2.7;

  get nRows() { return this.gamePlay.nRows }
  get nCols() { return this.gamePlay.nCols }

  // bgRect tall enough for (3 X mph + gap) PlayerPanels
  override bgXYWH(x0?: number, y0?: number, w0 = this.panelWidth * 2 + 1, h0 = .2, dw?: number, dh?: number): { x: number; y: number; w: number; h: number; } {
    const nr = this.nRows, nPanelRows = (TP.numPlayers > 4) ? 3 : 2;
    const h1 = Math.max(nr, nPanelRows * this.mph_g) - nr; // extra height beyond nr + h0
    return super.bgXYWH(x0, y0, w0, h0 + h1, dw, dh)
  }

  override layoutTable(gamePlay: GamePlay): void {
    const { table, hexMap, gameSetup } = gamePlay;
    super.layoutTable(gamePlay);
  }
  override makePerPlayer(): void {
    super.makePerPlayer();
    this.gamePlay.allPlayers.forEach(plyr => {
      this.scoreTrack.addMarkers(plyr);
    })
  }
  get super_panelHeight() {
    return TP.numPlayers > 4 ? this.nRows / 3 - .2 : this.nRows / 2 - .2;
  } // (2 * TP.nHexes - 1) / 3 - .2
  override get panelHeight() { return Math.max(this.super_panelHeight, this.mph_g - .2) }

  // getPanelLocs adapted for makeRect()
  override getPanelLocs() {
    const nPanelRows = 0;

    const { nh: nr, mh: nc } = this.hexMap.getSize();
    const rC = (nr - 1) / 2;
    const cC = (nc + 1) / 2;
    const coff = (nc / 2) + (this.panelWidth / 2) + .2;
    const ph = (TP.numPlayers > 4) ? this.panelHeight + .2 : (this.panelHeight + .2) / 2
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

  override layoutTable2() {
    this.initialVis = false;
    this.addDoneButton().activate(true);
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

  override startGame() {
    this.scaleCont.addChild(this.overlayCont); // now at top of the list.
    this.gamePlay.setNextPlayer(this.gamePlay.turnNumber > 0 ? this.gamePlay.turnNumber : 0);
  }

  override logCurPlayer(plyr: Player, tn = this.gamePlay.gameState.turnId) {
    super.logCurPlayer(plyr, tn)
  }

  override layoutTurnlog(rowy?: number, colx?: number): void {
    const row2 = rowy ?? Math.min(-.5, this.nRows - 7.5) + 3.5;
    const col2 = colx ?? (-1.8 - this.nCols * .5) - 4.5;
    super.layoutTurnlog(row2, col2)
    this.textLog.parent.addChildAt(this.textLog, 0)
  }
  override setupUndoButtons(bgr: XYWH, row?: number, col?: number, undoButtons?: boolean, xOffs?: number, bSize?: number, skipRad?: number): void {
    const row2 = row ?? Math.min(-.5, this.nRows - 7.5);
    const col2 = col ?? -1.8 - this.nCols * .5;
    super.setupUndoButtons(bgr, row2, col2, undoButtons, xOffs, bSize, skipRad)
  }
  override bindKeysToScale(scaleC: ScaleableContainer, ...views: (XY & { scale: number; isk: string; ssk?: string; })[]): void {
    const z_x = TP.numPlayers > 4 ? 420 : 470;
    const viewA = { x: 510, y: 2, scale: 0.500, isk: 'a'}
    const viewZ = { x: z_x, y: 2, scale: 0.647, isk: 'z', ssk: 'x' };
    super.bindKeysToScale(scaleC, viewA, viewZ);
  }

  // override countLegalHexes to highlight DualLegalMark and selfdrop;
  override markLegalHexes(tile: Tile, ctx: DragContext): number {
    const meep = ctx.tile as ColMeeple;
    let nLegal = 0;
    const countLegalHexes = (hex: IHex2) => {
      if (tile.isLegalTarget(hex, ctx)) {
        (hex as ColHex2).setIsLegal(true, meep); // ==> legalMark.visible = true;
        nLegal += 1;
      }
    };
    tile.markLegal(this, countLegalHexes, ctx); // visitor to check each potential target
    return nLegal;
  }

  override makeGUIs(scale?: number, cx?: number, cy?: number, dy?: number): void {
    this.guisToMake = [this.makeParamGUI]
    if (!this.stage.canvas) return;
    super.makeGUIs(scale, cx, cy);
  }

  override makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right' });
    gui.name = gui.Aname = 'ParamGUI';
    const gameSetup = this.gamePlay.gameSetup;
    gui.makeParamSpec('hexRad', [30, 45, 60, 90, 135,], { fontColor: 'red' }); TP.hexRad;
    gui.spec('hexRad').onChange = (item: ParamItem) => {
      PaintableShape.defaultRadius = item.value;
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
    gui.makeParamSpec('nElts', [1, 2, 4, 6, 8], { fontColor: 'red' }); TP.nElts;
    gui.spec('nElts').onChange = (item: ParamItem) => {
      gui.setValue(item);
      gameSetup.restart({})
    }

    gui.makeParamSpec('allBumpsDown', [true, false], {fontColor: C.legalGreen}); TP.allBumpsDown
    gui.makeParamSpec('bumpUpRow1', [true, false], {fontColor: C.legalGreen}); TP.bumpUpRow1
    gui.makeParamSpec('onePerRank', [true, false], {fontColor: C.legalGreen}); TP.onePerRank
    gui.makeParamSpec('topRankOnly', [true, false], {fontColor: C.legalGreen}); TP.topRankOnly
    gui.makeParamSpec('nTopMeeps', [1,2,3,4,9], {fontColor: C.legalGreen}); TP.nTopMeeps
    gui.makeParamSpec('showAllBids', [true, false], {fontColor: C.legalGreen}); TP.showAllBids

    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines();
    return gui
  }
  scoreTrack!: ScoreTrack;
  layoutScoreTrack(nElts = TP.nElts) {
    // ScoreTrack.findRGBV12(); // search for best permutation of ScoreTrack.rgbv12
    const scoreTrack = this.scoreTrack = new ScoreTrack(this, this.scaleCont, nElts, 30);
    const {x, y, width, height} = this.bgRect.getBounds()
    const bxy = this.bgRect.parent.localToLocal(x + width / 2, height, scoreTrack.parent);
    const { x: tx, y: ty, width: tw, height: th } = scoreTrack.getBounds();
    scoreTrack.x = bxy.x - tx - tw / 2;
  }

  /** state for initial conditions */
  saveState() {
    return { trackSegs: this.scoreTrack.trackSegs }
  }
}

class TrackGen {
  // initial balanced half-names, search for balanced 2nd half
  static rgbv12 = [
    'rgbv', 'gbvr', 'bvrg', 'vrgb',
    'rbvg', 'gvrb', 'brgv', 'vgbr',
    'rvgb', 'grbv', 'bgvr', 'vbrg',
  ];
  /** generate 12 anames for 12 TrackSegments */
  static genTrack12(search = false) {
    const rgbvsf = TrackGen.rgbv12; // 12 initial half-names
    const rgbvsr = rgbvsf.map(str => str.split('').reverse().join('')); // 12 reversed half-names
    const rgbvs = rgbvsf.concat(rgbvsr); // 24 half-names ["rgbv"..., "vbgr"...]
    // verify initial balance of rgbv12:
    // 'rgbv'.split('').forEach(f => {
    //   const nf = rgbvs.filter(tr => tr.startsWith(f)).length
    //   console.log(`nf(${f}) = ${nf}`)
    // })
    if (search) permute(rgbvs);
    /** all 12 anames */
    const track12: string[] = [];
    /** rgbv2 already used and excluded. */
    const rgbv2f: string[] = [];
    // make 12 segments (rotationally complete)
    for (let r1 = 0; r1 < rgbvs.length && track12.length < 12; r1++) {
      const rgbvs1 = rgbvs[r1], rgbv1 = `${rgbvs1}`
      if (rgbv2f.includes(rgbvs1)) {
        // console.log(`skip: ${rgbvs1}`);
        continue
      };
      const rgbv2 = `${rgbv1[1]}${rgbv1[0]}${rgbv1[3]}${rgbv1[2]}`;
      const rgbv0 = `${rgbv2[3]}${rgbv2[2]}${rgbv2[1]}${rgbv2[0]}`; // v2 reversed
      rgbv2f.push(rgbv0);
      if (rgbvs.includes(rgbv0)) {
        // console.log(`remove: ${rgbv1} --> ${rgbv0} [${r1}]`)
      }
      removeEltFromArray(rgbv0, rgbvs); // so we don't get a equiv reversal
      const aname = `${rgbv1}+${rgbv2}`;
      track12.push(aname);
    }
    if (!search) TrackGen.checkDist(track12); // show counts
    return track12
  }
  static findRGBV12() {
    let anames: string[], n = 0;
    do {
      if (n % 100 === 0) console.log(stime(this, `.findRGBV12: n =`), n)
      n++
      anames = TrackGen.genTrack12(true)
    } while (!TrackGen.checkDist(anames, false, false))
    console.log(stime(this, `.findRGBV12: anames =`), anames)
  }
  // return true if anames are uniformly distributed
  static checkDist(anames: string[], logEach = true, once = true) {
    let done = true, nsAll: number[][] = [];
    // count faction f in each column:
    'rgbv'.split('').forEach((f, fn) => {
      const ns: number[] = [];
      for (let s = 0; s < 4; s++) {
        const nf = anames.filter(tr => tr.substring(s, s + 1) === f).length
        ns.push(nf)
        if (nf !== 3) done = false;
      }
      nsAll.push(ns);
    })
    if (done || once) {
      console.log(stime(`TrackGen.checkDist (done: ${done} || once: ${once})`), anames);
      'rgbv'.split('').forEach((f, fn) => {
        const ns = nsAll[fn];
        console.log(`nf(f=${fn + 1}:${f}) = ${ns}`, done)
      })
    }
    return done ? anames : undefined;
  }
}

type RGBV = 'B' | 'r' | 'g' | 'b' | 'v';   // Black, red, gold, blue, violet [white]
const rgbvIndex: Record<RGBV, Faction> = { 'B': 0, 'r': 1, 'g': 2, 'b': 3, 'v': 4, }

class ScoreTrack extends NamedContainer {

  /** [0] upper-row factions; [1] lower-row factions  */
  factions: [Faction[], Faction[]] = [[0], [0]]; // initial 0 ('B') cell
  dx: number;
  dy: number;
  maxValue!: number;
  trackSegs!: string[]; // anames of each TrackSegment in use

  /**
   *
   * @param table to find bgRect
   * @param parent probably scalecont
   * @param nElts 6 is generally enough
   * @param radius [TP.hexRad/2]
   */
  constructor(public table: ColTable, parent: Container, nElts = 6, public radius = TP.hexRad * .5) {
    super('ScoreTrack');
    this.maxValue = nElts * 9;
    parent.addChild(this);
    this.addChild(this.segmentCont);
    this.addChild(this.markerCont);
    {
      const { x, y, height: bgHeight } = this.table.bgRect.getBounds();
      this.segmentCont.x = this.markerCont.x = x;
      this.segmentCont.y = this.markerCont.y = y + bgHeight;
    }
    const cardRad = new CardShape().getBounds().height / 2;
    const dx = this.dx = this.radius * 1.2, dy = this.dy = Math.max(dx * TP.numPlayers, cardRad);

    const tracks12 = TrackSegment.anames.map(aname => new TrackSegment(aname, dx, dy,)); // make 12 Segments
    const trackSegs = this.selectTrackSegs(tracks12);
    TP.trackSegs = this.trackSegs = trackSegs.map(ts => ts.Aname);
    trackSegs.forEach((seg, n) => {
      const [f0, f1] = seg.facts; // upper and lower factions for cells [1..9]
      this.factions[0] = this.factions[0].concat(f0);
      this.factions[1] = this.factions[1].concat(f1);
      this.segmentCont.addChild(seg);
      seg.y = dy;
      seg.x = dx * (n * 9 + 4.5);
    })
    // extend BLACK on each end by w = dx / 2; (on segmentCont, not in TrackSegment)
    const x = 0, y = 0, w = dx / 2, h = 2 * dy, s = 1, nx9 = (nElts * 9);
    this.segmentCont.addChild(new RectShape({ x: x - dx * 0.5, y, w, h, s }, C.BLACK, ))
    this.segmentCont.addChild(new RectShape({ x: x + dx * nx9, y, w, h, s }, C.BLACK, ))

    this.overlayCont.x = this.segmentCont.x
    this.overlayCont.y = this.segmentCont.y
    this.addChild(this.overlayCont); // holds clicker(s) and ray(s)
    this.table.dragger.makeDragable(this, this)//, ()=>{this.scaleX=this.scaleY=.5}, ()=>{this.scaleX=this.scaleY=1});
  }

  selectTrackSegs(tracks12: TrackSegment[], trackSegs = TP.trackSegs, nElts = TP.nElts) {
    if (trackSegs) {
      return trackSegs.map(aname => tracks12.find(ts => ts.Aname === aname)) as TrackSegment[]
    } else {
     return permute(tracks12).slice(0, nElts)
    }
  }

  overlayCont = new NamedContainer('overlay')
  segmentCont = new NamedContainer('segmentCont');
  markerCont = new NamedContainer('markerCont');
  markers: [MarkerShape, MarkerShape][] = [];
  addMarkers(plyr: Player) {
    const markers = [this.makeScoreMarker(plyr, 0), this.makeScoreMarker(plyr, 1)] as [MarkerShape, MarkerShape]
    this.markers.push(markers);
    this.markerCont.addChild(...markers);
  }
  makeScoreMarker(plyr: Player, index = 0) {
    return new MarkerShape(plyr, this, undefined, index);
  }
}

export class MarkerShape extends CircleShape {
  /**
   *
   * @param player
   * @param scoreTrack
   * @param marker parent marker for clicker
   * @param track determines initial track (& yoff)
   */
  constructor(public player: Player, public scoreTrack: ScoreTrack, public marker?: MarkerShape, track = 0) {
    super(player.color, scoreTrack.radius / 2, marker ? C.WHITE : C.grey128);
    this.setValue(0, track);
    if (!marker) {
      // Each primary MarkerShape gets two 'clickers'; which are a MarkerShape with strokeC.
      const clicker1 = this.clicker1 = new MarkerShape(player, scoreTrack, this, track);
      const clicker2 = this.clicker2 = new MarkerShape(player, scoreTrack, this, track);
      clicker1.visible = clicker2.visible = true;
      clicker1.mouseEnabled = clicker2.mouseEnabled = true;
      clicker1.on(S.click, (evt) => clicker1.onClick(), clicker1, false)
      clicker2.on(S.click, (evt) => clicker2.onClick(), clicker2, false)
    }
  }
  /** 0: upper-track, 1: lower-track */
  track!: number;
  value!: number;
  index!: number;
  get faction() {
    const bothFactions = this.scoreTrack.factions
    const tfaction = bothFactions[this.track]
    return tfaction[this.value];
  }
  /**
   *
   * @param value
   * @param track 0: upper-track, 1: lower-track [previous index]
   */
  setValue(value: number, track = this.track) {
    if (this.index == undefined) this.index = track;// scoreTrack[plyr.index].indexOf(m => m == this)
    const { dx, dy, radius } = this.scoreTrack; // dx ~= radius * 1.2
    this.track = track;
    this.value = value;
    this.x = value * dx;
    this.y = track * dy + this.player.index * dx + radius * [.55, .65][this.index];
    if (!this.marker) this.player.scoreCount(this); // PRIMARY: update GUI
  }

  /** clicker was clicked: move its marker to match; then marker.clickDone() */
  onClick() {
    const marker = this.marker as MarkerShape; // ASSERT: each clicker has a marker
    marker.setValue(this.value, this.track);
    marker.scoreTrack.overlayCont.removeAllChildren(); // circles & rays
    afterUpdate(marker.scoreTrack, () => marker.clickDone(), this, 10)
  }
  clickDone!: () => void;
  clicker1!: MarkerShape;
  clicker2!: MarkerShape; // used if score crosses a black cell

  /** clicker1.setValue(this.value + dScore, this.index)
   * maybe: clicker2.setValue(this.value + dScore); on the OTHER track.
   */
  showDeltas(dScore: number, clickDone: () => void, clicker = this.clicker1, isClkr1 = true) {
    this.clickDone = clickDone;  // set on primary MarkerShape
    const trackMax = this.scoreTrack.factions[0].length - 1;
    const over = this.scoreTrack.overlayCont, sCur = this.value, sNew = Math.min(sCur + dScore, trackMax);
    const [ms0, ms1] = this.scoreTrack.markers[this.player.index]; // the PRIMARY MarkerShapes
    const sCell = (ms0.track == ms1.track) && (ms0.value == ms1.value) // from same cell
    if (sCell && !isClkr1) return;      // do not show sib[1]
    // In actual game, players choose/rotate an 'advance marker card'
    // for simultaneous reveal; here we *could* defer setValue(), but it's not an issue.
    clicker.setValue(sNew, isClkr1 ? this.track : 1 - this.track);
    const ray = new Shape();
    ray.graphics.s(C.black).mt(this.x, this.y).lt(clicker.x, clicker.y).es();
    ray.mouseEnabled = false;
    over.addChild(ray, clicker);
    // maybe draw second target:
    const b0 = Math.ceil(sCur / 9), b1 = Math.ceil(sNew / 9); // on or crossing a Black
    if (isClkr1 && !sCell && !(b0 == b1)) {
      this.showDeltas(dScore, clickDone, this.clicker2, false)
      // if converging on same cell of index0, put clicker1 on top:
      if (this === ms1 && ms0.value == ms1.value) {
        over.addChild(ms0.clicker1)
      }
    }
  }
}

/** a segment of the score track; B-rgbv-vbgr-B (where B is half size) */
export class TrackSegment extends ColCard {
  // anames derived from TrackGen (monte carlo search)
  static anames = [
    'rvgb+vrbg', 'bgvr+gbrv', 'rgbv+grvb', 'gvbr+vgrb',
    'vrgb+rvbg', 'brvg+rbgv', 'bgrv+gbvr', 'grbv+rgvb',
    'rbvg+brgv', 'gvrb+vgbr', 'vbrg+bvgr', 'vbgr+bvrg',
  ];
  static seqN = 0;

  /**
   * 9 * 12 = 108; 9 * 11 = 99 (end of game)
   * @example
   * Brgbv1-rgbv2B
   * Bvbgr1-vbgr2B
   * @param Aname codes the sequence of each rgbv segment.
   *
   * @param w [20] width of cell, marker radius * 1.1
   * @param h [80] height of cell, marker radius * nPlayers
   */
  constructor(Aname: string, w = 20, h = 80, bleed = 0) {
    if (!Aname) {
      if (TrackSegment.seqN >= TrackSegment.anames.length) TrackSegment.seqN = 0;
      Aname = TrackSegment.anames[TrackSegment.seqN++]
    }
    super(Aname, 5)
    this.removeAllChildren();
    this.setBounds(0, 0, 0, 0);
    this.addChild(this.slots); this.slots.x = w * -4.5;
    this.wh = { w, h }
    const B = ['B'] as RGBV[];
    const [rgbv0, rgbv1] = Aname.split('+');
    const ary0 = rgbv0.split('') as RGBV[], ary1 = rgbv1.split('') as RGBV[];
    const factions01 = B.concat(ary0, ary1, B).map(s => rgbvIndex[s]);
    const factions10 = B.concat(ary1, ary0, B).reverse().map(s => rgbvIndex[s]);
    factions01.forEach((f0, n) => {
      const f1 = factions10[n];
      this.addSlot(n, f0, f1, w, h + bleed, bleed); // half-slot for B on each end.
    })
    this.facts = [factions01.slice(1), factions10.slice(1)]; // remove initial 'B'
    const { x, y, width, height } = this.getBounds() // x = 0, y = -dy, width = 9 * dx, height = 2 * dy;
    this.cache(x, y, width, height, 4);
  }
  /** slot size */
  wh!: { w: number, h: number }
  facts: [Faction[], Faction[]];
  slots = new NamedContainer('slots');

  addSlot(n: number, f1: number, f2: number, w: number, h: number, bleed = 0, s = 1) {
    const factionColor = (faction: number) => ColCard.factionColors[faction];
    const c1 = factionColor(f1), c2 = factionColor(f2), b0 = (bleed == 0)
    const we = (f1 == 0) ? (b0 ? w / 2 : w / 2 + bleed) : w;
    const x = w * n + ((n == 0) ? (b0 ? 0 : -bleed) : - w / 2) + 1; // shift right by 1 px to align with counters
    const rect1 = new RectShape({ s, x, w: we, h, y: -h }, c1);
    const rect2 = new RectShape({ s, x, w: we, h, y: .0 }, c2);
    this.slots.addChild(rect1, rect2)
    this.setBoundsNull(); // so createjs will compute containers bounds from children.
  }
  override makeBleed(bleed: number) {
    const { w, h } = this.wh;
    const rv = new TrackSegment(this.Aname, w, h, bleed);
    this.removeAllChildren();
    this.addChild(rv);
    this.reCache();
    return rv
  }
}

/** Printable labels to annotate the value along the TrackSegment cards. */
export class TrackLabel extends TextInRect {
  static seqN = 0;
  static rotateBack = undefined;
  static countClaz(gs: GridSpec, rot = 0, n = 54, nLim = 54) {
    return [[n, TrackLabel, gs, rot, nLim]] as CountClaz[];
  }

  /** labels 0..54; construct @ 300 dpi, to printer @ 25% */
  constructor(gs: GridSpec, rot = 0, seqLim = 54) {
    if (TrackLabel.seqN >= seqLim) TrackLabel.seqN = 0;
    const i = TrackLabel.seqN++, fontSize = (gs.dpi ?? 1) * .1;
    super(`${ i }`, { fontSize })
    this.rotation = rot;
    this.borders = [fontSize, fontSize, 1, 1]; // ensure single digits are landscape
    this.setBounds(undefined, 0, 0, 0);
  }

  makeBleed() { return this }

  /** GridSpec to create long rows of digits aligned with TrackSegment cards */
  static gridSpec: GridSpec = {
    dpi: 300,
    width: 8.0,
    height: 10.5,
    nrow: 20,
    ncol: 9 * 2,   // span 2 TrackSegments
    y0: .5,
    x0: .5,
    delx: 3.5 / 9, // 3.5 inch card, with 9 slots
    dely: 4 / 8,   // separate rows by half-inch
    bleed: 0,
    trimLCR: false,
    land: true,
    bgColor: C.WHITE,
    scale: .25,
  }
}
