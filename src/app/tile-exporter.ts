import { arrayN } from "@thegraid/common-lib";
import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz } from "@thegraid/easeljs-lib";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { BlackCard, CursusBack, DetailCard, PrintCol, PrintDual, PrintSpecial, SummaryCard, WhiteCard } from "./col-card";
import { TrackLabel, TrackSegment } from "./col-table";
import { GameSetup } from "./game-setup";
import { Statics } from "./statics";
// end imports

export class TileExporter extends TileExporterLib {
  constructor(pageMaker = ImageGrid) {
    super(pageMaker);
    this.imageGrid.setScale('.05');  // start small
  }

  override makeImagePages() {
    const allCols = GameSetup.gameSetup.gamePlay.allCols;
    const allDuals = GameSetup.gameSetup.gamePlay.allDuals;

    // MPC: min size: 597 x 822 pixels (300DPI) 1.99 x 2.74; 2.0 (600?) x 2.75 (825?)
    const dpi = 300, p3_5 = 3.5 * dpi, p2_5 = 2.5*dpi, p1_75 = 1.75*dpi; // bleed*2 = .25
    // [TileExporter.cardSingle_1_75_in, TileExporter.cardSingle_3_5_in].forEach(ig => ig.dpi = dpi);
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
      ...PrintDual.countClaz(16, p1_75, allDuals),  // 16
      ...PrintCol.countClaz(48, p1_75, allCols),  // 48
      ...BlackCard.countClaz(6, p1_75),  // black cards (blank)
      ...WhiteCard.countClaz(6, p1_75),  // white cards (col nums)

      // 16(D) 48(C) 18(B, W, SD) = 82;
      // 7 player * 11 (bid/col)  = 77; 159 <-- Straight up = 25.15

      // could make multi decks for the table cards: 3 decks of

      // 6 Special, 3 small Summary + 9 * (12 bid/sel) 9*12 = 108; 9 * 13 = 121 + 78 = 199!
      // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!


      // 64 + 14 = 78;
      // 6 x SpecialDead among the Bid/ColSelect cards
      // 6 Special, 3 small Summary + 9 * (12 bid/sel) 9*12 = 108; 9 * 13 = 121 + 78 = 199!
      // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!
      //
    ] as CountClaz;
    const cardSingle_1_75_hand = arrayN(9).flatMap(f => [   // 6-9 sets?
      // 9 groups of 12 cards: bid, col, dead office
      ...PrintBidValue.countClaz(4, f, p3_5/2),
      ...PrintColSelect.countClaz(7, f, p3_5/2),
      ...(f < 6) ? PrintSpecial.countClaz(1) : [[1, SummaryCard, 'Summary', p3_5/2]],
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
    // this.clazToTemplate(cardSingle_3_5_track, Statics.cardSingle_3_5_in, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_base, Statics.cardSingle_1_75_px, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_hand, Statics.cardSingle_1_75_px, pageSpecs);
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd

  //[Screentop](https://screentop.gg/) or [PlayingCards IO](https://playingcards.io/).
