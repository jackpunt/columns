import { Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { Tile as TileLib } from "@thegraid/hexlib";
import { BlackCard, PrintCol, PrintDual, SetupCard } from "./col-card";
import { PrintBidValue, PrintColSelect } from "./col-meeple";
import { TrackSegment } from "./col-table";
import { ImageGrid, PageSpec, type GridSpec } from "./image-grid";
import { Player } from "./player";
import { TP } from "./table-params";
// end imports

interface Tile extends DisplayObject {
  baseShape: DisplayObject;
  radius: number;
}

interface Claz extends Constructor<Tile> {
  /** 0 => flip-on-horiz-axiz, 180 => flip-on-vert-axis, undefined => blank */
  rotateBack?: number | undefined;
  colorBack?: string | undefined;
}

/** [number of copies, Constructor, ... constructor args] */
export type CountClaz = [count: number, claz: Claz, ...args: any];
export class TileExporter {

  imageGrid = new ImageGrid(() => { return this.makeImagePages() });

  makeImagePages() {
    const u = undefined, [nRows, nCols] = [TP.nHexes, TP.mHexes], nCards = nRows*nCols;
    // [...[count, claz, ...constructorArgs]]
    const cardSingle_3_5 = [
      [12, TrackSegment, '', 1050/9, 750/2],
      [6, SetupCard, '野心', 750],
      // card back if we want it.      // [18, TrackSegment, '', 1050/9, 750/2],
    ] as CountClaz[];
    const cardSingle_1_75_back = [
      [36, SetupCard, '野心'],   // card back if we want it.
    ] as CountClaz[];
    const cardSingle_1_75_base = [
      ...BlackCard.countClaz(8),
      ...BlackCard.countClaz(8),
      ...PrintCol.countClaz(20),
      ...PrintCol.countClaz(20),
      ...PrintDual.countClaz(16),
    ]
    const cardSingle_1_75_hand = [
      ...PrintBidValue.countClaz(4, 0, 525),
      ...PrintBidValue.countClaz(4, 1, 525),
      ...PrintBidValue.countClaz(4, 2, 525),
      ...PrintBidValue.countClaz(4, 3, 525),
      ...PrintBidValue.countClaz(4, 4, 525),
      ...PrintBidValue.countClaz(4, 5, 525),
      ...PrintBidValue.countClaz(4, 6, 525),
      ...PrintBidValue.countClaz(4, 7, 525),
      ...PrintBidValue.countClaz(4, 8, 525),
      ...PrintColSelect.countClaz(7, 0, 525),
      ...PrintColSelect.countClaz(7, 1, 525),
      ...PrintColSelect.countClaz(7, 2, 525),
      ...PrintColSelect.countClaz(7, 3, 525),
      ...PrintColSelect.countClaz(7, 4, 525),
      ...PrintColSelect.countClaz(7, 5, 525),
      ...PrintColSelect.countClaz(7, 6, 525),
      ...PrintColSelect.countClaz(7, 7, 525),
      ...PrintColSelect.countClaz(7, 8, 525),
      [7, PrintColSelect, 7, 9, 525],
      [2, PrintColSelect, 0, 9, 525],
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];

    // this.clazToTemplate(cardSingle_3_5, ImageGrid.cardSingle_3_5, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_base, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_hand, ImageGrid.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

  /** rotate card to align with template orientation */
  setOrientation(card: Tile, gridSpec: GridSpec, rot = 90) {
    const { width, height } = card.getBounds(), c_land = width > height;
    const t_land = gridSpec.delx > gridSpec.dely;
    if (c_land !== t_land) {
      card.rotation += rot;
      card.updateCache()
    }
  }

  /** compose bleed, background and Tile (Tile may be transparent, so white background over bleed) */
  composeTile(claz: Constructor<Tile>, args: any[], gridSpec: GridSpec, color?: string  , edge: 'L' | 'R' | 'C' = 'C') {
    const cont = new Container();

    const tile = new claz(...args) as TileLib;
    this.setOrientation(tile, gridSpec);
    color && tile.paint(color);
    const bleedShape = this.makeBleed(tile, gridSpec, edge)
    cont.addChild(bleedShape, tile);

    return cont;
  }

  makeBleed(tile: TileLib, gridSpec: GridSpec, edge: 'L' | 'R' | 'C' = 'C') {
    const bleed = gridSpec.bleed ?? 0;
    const bleedShape = tile.makeBleed(bleed)

    if (gridSpec.trimLCR) { // for close-packed shapes, exclude bleed on C edges
      // trim bleedShape to base.bounds; allow extra on first/last column of row:
      const dx0 = (edge === 'L') ? bleed : 0, dw = (edge === 'R') ? bleed : 0;
      const { x, y, width, height } = tile.getBounds(), dy = -3;
      bleedShape.setBounds(x, y, width, height);
      bleedShape.cache(x - dx0, y - dy, width + dx0 + dw, height + 2 * dy);
    }
    return bleedShape;
  }

  /** each PageSpec will identify the canvas that contains the Tile-Images */
  clazToTemplate(countClaz: CountClaz[], gridSpec = ImageGrid.hexDouble_1_19, pageSpecs: PageSpec[] = []) {
    const both = false, double = gridSpec.double ?? true;
    const frontAry = [] as DisplayObject[][];
    const backAry = [] as (DisplayObject[] | undefined)[];
    const page = pageSpecs.length;
    const { nrow, ncol } = gridSpec, perPage = nrow * ncol;
    let nt = page * perPage;
    countClaz.forEach(([count, claz, ...args]) => {
      const frontColor = both ? Player.allPlayers[0].color : undefined;
      const backColor = both ? Player.allPlayers[1].color : claz.colorBack !== undefined ? claz.colorBack : undefined;
      const nreps = Math.abs(count);
      for (let i = 0; i < nreps; i++) {
        const n = nt % perPage, pagen = Math.floor(nt++ / perPage);
        const addBleed = (true || n > 3 && n < 32) ? undefined : -10; // for DEBUG: no bleed to see template positioning
        if (!frontAry[pagen]) frontAry[pagen] = [];
        const col = n % ncol, lcr = (col === 0) ? 'L' : (col === ncol - 1) ? 'R' : 'C';
        const frontTile = this.composeTile(claz, args, gridSpec, frontColor, lcr);
        frontAry[pagen].push(frontTile);
        if (double) {
          const backAryPagen = backAry[pagen] ?? (backAry[pagen] = []) as (DisplayObject | undefined)[];
          let backTile = undefined;
          if (claz.rotateBack !== undefined) {
            backTile = this.composeTile(claz, args, gridSpec, backColor, lcr);
            const tile = backTile.getChildAt(2); // [bleed, back, tile]
            tile.rotation = claz.rotateBack;
          }
          backAryPagen.push(backTile);
        }
      }
    });
    frontAry.forEach((ary, pagen) => {
      const frontObjs = frontAry[pagen], backObjs = double ? backAry[pagen] : undefined;
      const canvasId = `canvas_P${pagen}`;
      const pageSpec = { gridSpec, frontObjs, backObjs };
      pageSpecs[pagen] = pageSpec;
      console.log(stime(this, `.makePage: canvasId=${canvasId}, pageSpec=`), pageSpec);
      this.imageGrid.makePage(pageSpec, canvasId);  // make canvas with images, but do not download [yet]
    })
    return pageSpecs;
  }

}
