import { arrayN } from "@thegraid/common-lib";
import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz, type GridSpec } from "@thegraid/easeljs-lib";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { BlackCard, DetailCard, PrintCol, PrintDual, PrintSpecial, CursusBack, SummaryCard, WhiteCard } from "./col-card";
import { TrackLabel, TrackSegment } from "./col-table";
// end imports

export class TileExporter extends TileExporterLib {
  constructor(pageMaker = ImageGrid) {
    super(pageMaker);
    this.imageGrid.setScale('.05');  // start small
  }
  static cardSingle_3_5_px: GridSpec = {
    width: 3600, height: 5400, nrow: 6, ncol: 3, cardw: 1050, cardh: 750, // (inch_w*dpi + 2*bleed)
    x0: 120 + 3.5 * 150 + 30, y0: 83 + 3.5 * 150 + 30, delx: 1125, dely: 825, bleed: 30, double: false,
  };

  // 18 cards: portrait mode; browser viewport may cut off bottom
  static cardSingle_3_5_in: GridSpec = {
    dpi: 300, width: 12, height: 18, nrow: 6, ncol: 3, cardh: 3.5, cardw: 2.5, // (inch_w*dpi + 2*bleed)
    x0: .5 + 3.5 * .5, y0: 113/300 + 2.5/2, delx: 3.75, dely: 2.75, bleed: 32/300, double: false, land: true,
  };

  // { ...ImageGrid, ncol: 6, width: 4200, split: false }
  static cardSingle_1_75_px = {
    width: 4200, height: 5400, nrow: 6, ncol: 6, cardh: 525, cardw: 750, double: false, split: false,
    x0: 334 + 1.75 * 150, y0: 150 + 2.5 * 150, delx: 600, dely: 825, bleed: 30, // (2705-305)/4, (1770-120)/2
};
  static cardSingle_1_75_in = {
    dpi: 300, width: 14, height: 20, nrow: 6, ncol: 6, cardh: 1.75, cardw: 2.5, double: false, split: false,
    x0: 1.33 + 1.75/2, y0: .5 + 2.5/2, delx: 2.1, dely: 2.80, bleed: .125, // (2705-305)/4, (1770-120)/2
};

  override makeImagePages() {
    // MPC: min size: 597 x 822 pixels (300DPI) 1.99 x 2.74; 2.0 (600?) x 2.75 (825?)
    const dpi = 300, p3_5 = 3.5 * dpi, p2_5 = 2.5*dpi, p1_75 = 1.75*dpi; // bleed*2 = .25
    [TileExporter.cardSingle_1_75_in, TileExporter.cardSingle_3_5_in].forEach(ig => ig.dpi = dpi);
    // [...[count, claz, ...constructorArgs]]
    const cardSingle_3_5_track = [
      [3, SummaryCard, 'Summary', p2_5],
      [3, DetailCard, 'Detail', p2_5], //
      ...TrackSegment.countClaz(12, p3_5, p2_5),
    ] as CountClaz[];
    const cardSingle_1_75_back = [
      [18, CursusBack, 'Back', 'Cursus\nHonorum'],   // card back if we want it.
    ] as CountClaz[];
    const cardSingle_1_75_base = [
      ...BlackCard.countClaz(7, p1_75),  // black cards (blank)
      ...WhiteCard.countClaz(7, p1_75),  // white cards (col nums)
      ...PrintDual.countClaz(6, p1_75),  // 16
      ...PrintCol.countClaz(16, p1_75),  // 60
    ] as CountClaz;
    const cardSingle_1_75_hand = arrayN(3).flatMap(f => [   // 6-9 sets?
      // 9 groups of 12 cards: bid, col, dead office
      ...PrintBidValue.countClaz(4, f, p3_5/2),
      ...PrintColSelect.countClaz(7, f, p3_5/2),
      ...(f < 6) ? PrintSpecial.countClaz(1) : [[1, SummaryCard, 'Summary', undefined, p3_5/2]],
    ]) as CountClaz[];

    const gs = TrackLabel.gridSpec; gs.dpi = 300
    const pp = 54;
    const labelCols = [
      ...TrackLabel.countClaz(gs, 0, pp, pp),
      ...TrackLabel.countClaz(gs, 180, pp, pp),
      ...TrackLabel.countClaz(gs, 0, pp, pp),
      ...TrackLabel.countClaz(gs, 180, pp, pp),
      ...TrackLabel.countClaz(gs, 0, pp, pp),
      ...TrackLabel.countClaz(gs, 180, pp, pp),
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];
    // this.clazToTemplate(labelCols, TrackLabel.gridSpec, pageSpecs)
    // this.clazToTemplate(cardSingle_3_5_track, TileExporter.cardSingle_3_5_in, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_base, TileExporter.cardSingle_1_75_in, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_hand, TileExporter.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd

  //[Screentop](https://screentop.gg/) or [PlayingCards IO](https://playingcards.io/).
