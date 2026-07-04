import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz, type GridSpec } from "@thegraid/easeljs-lib";
import { BlackCard, PrintCol, PrintDual, PrintSpecial, SetupCard, SetupCard2, SummaryCard, WhiteCard } from "./col-card";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { TrackLabel, TrackSegment } from "./col-table";
import { arrayN } from "@thegraid/common-lib";
// end imports

export class TileExporter extends TileExporterLib {
  constructor(pageMaker = ImageGrid) {
    super(pageMaker);
    this.imageGrid.setScale('.05');  // start small
  }
  // Note: 1108 = 1050 + 2 * (bleed-1); 808 = 750 + 2 * (bleed-1)
  static cardSingle_3_5_MPC: GridSpec = {
    width: 5400, height: 3600, nrow: 3, ncol: 4, cardw: 1050, cardh: 750, // (inch_w*dpi + 2*bleed)
    x0: 120 + 3.5 * 150 + 30, y0: 83 + 3.5 * 150 + 30, dely: 1125, delx: 825, bleed: 32, double: false, land: false,
  };

  override makeImagePages() {
    // [...[count, claz, ...constructorArgs]]
    const cardSingle_3_5_track = [
      ...TrackSegment.countClaz(3, 1050, 750),
      [3, SummaryCard, undefined, 750],
      [3, SetupCard2, undefined, 750], //  '"利刃出击"' // (Blades Strike: "Knives Out")
    ] as CountClaz[];
    const cardSingle_1_75_back = [
      [36, SetupCard, '"利刃出击"'],   // card back if we want it.
    ] as CountClaz[];
    const cardSingle_1_75_base = [
      ...BlackCard.countClaz(7, 0),  // black cards (blank)
      ...WhiteCard.countClaz(7, 1),  // white cards (col nums)
      ...PrintDual.countClaz(16),
      ...PrintCol.countClaz(60),
    ] as CountClaz;
    const cardSingle_1_75_hand = arrayN(9).flatMap(f => [
      // 9 groups of 12 cards: bid, col, dead office
      ...PrintBidValue.countClaz(4, f, 525),
      ...PrintColSelect.countClaz(7, f, 525),
      ...(f < 6) ? PrintSpecial.countClaz(1) : [[1, SummaryCard, 525]],
    ]) as CountClaz[];

    const gs = TrackLabel.gridSpec; gs.dpi = 300;
    const labelCols = [
      ...TrackLabel.countClaz(gs, 0, 54, 54),
      ...TrackLabel.countClaz(gs, 180, 54, 54),
      ...TrackLabel.countClaz(gs, 0, 54, 54),
      ...TrackLabel.countClaz(gs, 180, 54, 54),
      ...TrackLabel.countClaz(gs, 0, 54, 54),
      ...TrackLabel.countClaz(gs, 180, 54, 54),
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];
    // this.clazToTemplate(labelCols, TrackLabel.gridSpec, pageSpecs)
    this.clazToTemplate(cardSingle_3_5_track, TileExporter.cardSingle_3_5_MPC, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_base, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_hand, ImageGrid.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd

  //[Screentop](https://screentop.gg/) or [PlayingCards IO](https://playingcards.io/).
