import { Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { BlackCard, PrintCol, PrintDual, SetupCard, SummaryCard } from "./col-card";
import { PrintBidValue, PrintColSelect } from "./col-meeple";
import { TrackSegment } from "./col-table";
import { ImageGrid, PageSpec, type GridSpec } from "./image-grid";
import { TP } from "./table-params";
// end imports


/** "Tile" in this case is any DisplayObject with a makeBleed() */
interface Tile extends DisplayObject {
  makeBleed(bleed: number): DisplayObject;
}

interface Claz extends Constructor<Tile> {
  /** 0 => flip-on-horiz-axiz, 180 => flip-on-vert-axis, undefined => blank */
  rotateBack?: number | undefined; // static: indicates of a special Back tile is used
}

/** [number of copies, Constructor, ... constructor args] */
export type CountClaz = [count: number, claz: Claz, ...args: any];
class TileExporterLib {

  imageGrid = new ImageGrid(() => { return this.makeImagePages() });

  makeImagePages() {
    const pageSpecs: PageSpec[] = [];
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

  /** Compose tile = new claz(...args) with bleedShape = makeBleed(tile)
   * @returns Container[bleedShape, tile]
   */
  composeTile(claz: Constructor<Tile>, args: any[], gridSpec: GridSpec, back = false, edge: 'L' | 'R' | 'C' = 'C') {
    const cont = new Container();

    const tile = new claz(...args);
    this.setOrientation(tile, gridSpec);
    const bleedShape = this.makeBleed(tile, gridSpec, back, edge)
    cont.addChild(bleedShape, tile);

    return cont;
  }

  /**
   * Make outer bleed for the given tile. Trim bounds of on L or R edge
   */
  makeBleed(tile: Tile, gridSpec: GridSpec, back: boolean, edge: 'L' | 'R' | 'C' = 'C') {
    const bleed = gridSpec.bleed ?? 0;
    const bleedShape = tile.makeBleed(bleed) // 0 or -10 to hide bleed

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
    const frontAry = [] as DisplayObject[][];
    const backAry = [] as (DisplayObject[] | undefined)[];
    const page = pageSpecs.length, double = gridSpec.double ?? true;
    const { nrow, ncol } = gridSpec, perPage = nrow * ncol;
    let nt = page * perPage;
    countClaz.forEach(([count, claz, ...args]) => {
      const nreps = Math.abs(count);
      for (let i = 0; i < nreps; i++) {
        const n = nt % perPage, pagen = Math.floor(nt++ / perPage);
        if (!frontAry[pagen]) frontAry[pagen] = [];
        const col = n % ncol, lcr = (col === 0) ? 'L' : (col === ncol - 1) ? 'R' : 'C';
        const frontTile = this.composeTile(claz, args, gridSpec, false, lcr);
        frontAry[pagen].push(frontTile);
        if (double) {
          const backAryPagen = backAry[pagen] ?? (backAry[pagen] = []) as (DisplayObject | undefined)[];
          let backTile = undefined;
          if (claz.rotateBack !== undefined) {
            backTile = this.composeTile(claz, args, gridSpec, true, lcr);
            const tile = backTile.getChildAt(1); // [bleed, tile]
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

export class TileExporter extends TileExporterLib {

  override makeImagePages() {
    const u = undefined, [nRows, nCols] = [TP.nHexes, TP.mHexes], nCards = nRows * nCols;
    // [...[count, claz, ...constructorArgs]]
    const cardSingle_3_5_track = [
      [12, TrackSegment, '', 1050/9, 750/2],
      [3, SetupCard, '野心', 750],
      [3, SetupCard, '"利刃出击"', 750], //  '"利刃出击"' // (Blades Strike: "Knives Out")
    ] as CountClaz[];
    const cardSingle_1_75_back = [
      [36, SetupCard, '"利刃出击"'],   // card back if we want it.
    ] as CountClaz[];
    const cardSingle_1_75_base = [
      ...BlackCard.countClaz(8),
      ...BlackCard.countClaz(8),
      // ...PrintDual.countClaz(16),
      // ...PrintCol.countClaz(4),
      // ...PrintCol.countClaz(36),
    ]
    const cardSingle_1_75_hand = [
      // ...PrintBidValue.countClaz(4, 0, 525),
      // ...PrintBidValue.countClaz(4, 1, 525),
      // ...PrintBidValue.countClaz(4, 2, 525),
      // ...PrintBidValue.countClaz(4, 3, 525),
      // ...PrintBidValue.countClaz(4, 4, 525),
      // ...PrintBidValue.countClaz(4, 5, 525),
      // ...PrintBidValue.countClaz(4, 6, 525),
      // ...PrintBidValue.countClaz(4, 7, 525),
      // ...PrintBidValue.countClaz(4, 8, 525),
      ...BlackCard.countClaz(8),
      ...PrintColSelect.countClaz(7, 0, 525),
      ...PrintColSelect.countClaz(7, 1, 525),
      ...PrintColSelect.countClaz(7, 2, 525),
      ...PrintColSelect.countClaz(7, 3, 525),
      ...PrintColSelect.countClaz(7, 4, 525),
      ...PrintColSelect.countClaz(7, 5, 525),
      ...PrintColSelect.countClaz(7, 6, 525),
      ...PrintColSelect.countClaz(7, 7, 525),
      ...PrintColSelect.countClaz(7, 8, 525),
      [1, SummaryCard, 525],
      // [7, PrintColSelect, 7, 9, 525],
      // [2, PrintColSelect, 0, 9, 525],
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];

    // this.clazToTemplate(cardSingle_3_5_track, ImageGrid.cardSingle_3_5, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_base, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_hand, ImageGrid.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

}
