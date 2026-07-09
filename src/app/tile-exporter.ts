import { arrayN } from "@thegraid/common-lib";
import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz } from "@thegraid/easeljs-lib";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { BlackCard, ColCard, CoverCard, CursusBack, DetailCard, PrintCol, PrintDual, PrintSpecial, SummaryCard, WhiteCard } from "./col-card";
import { TrackLabel, TrackSegment } from "./col-table";
import { Player } from "./player";
import { Statics } from "./statics";
// end imports

export class TileExporter extends TileExporterLib {
  constructor(pageMaker = ImageGrid) {
    super(pageMaker);
    this.imageGrid.setScale('.05');  // start small
  }

  override makeImagePages() {
    const ncol = 6;
    const nplyr = 8;
    // MPC: min size: 597 x 822 pixels (300DPI) 1.99 x 2.74; 2.0 (600?) x 2.75 (825?)
    // MPC: 555 x 816 !?
    const dpi = 300, p3_5 = 3.48 * dpi, p2_5 = 2.5*dpi, p1_75 = 1.75*dpi; // bleed*2 = .25
    // [TileExporter.cardSingle_1_75_in, TileExporter.cardSingle_3_5_in].forEach(ig => ig.dpi = dpi);
    // [...[count, claz, ...constructorArgs]]

    // 3 Cover + 12 Track + 3 Summary = 18 @ $ 10.95 (MPC)
    // 2D + 1S + 12 Detail + 3 Detail
    const cardSingle_3_5_track = [
      ...SummaryCard.countClaz(6, 'Summary', p2_5),
      ...TrackSegment.countClaz(12, p3_5, p2_5),
      ...CoverCard.countClaz(6, 'Cover', p2_5),
      ...DetailCard.countClaz(12, 'Detail', p2_5),
    ] as CountClaz[];

    // 16(D) 48(C) 18(B, W, SD) = 82;
    // 7 player * 11 (bid/col)  = 77; 159 <-- Straight up = 25.15
    // 12 Track & 3 Summary & 3 Detail   // 18 @ 10.95

    // 6 Special, 3 small Summary + 9 * (12 bid/sel) 9*12 = 108; 9 * 13 = 121 + 78 = 199!
    // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!

    // 7 * (10 bid/sel) 7*10 = 70; 9 * 13 = 121 + 78 = 199!
    // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!

    const cardSingle_1_75_base = [
      ...PrintDual.countClaz(16, p1_75), // 16 60-75

      ...BlackCard.countClaz(6, p1_75),  //  6 Black cards (blank)
      ...WhiteCard.countClaz(6, p1_75),  //  6 Col0N cards (col nums)
      ...PrintSpecial.countClaz(4),      //  4 Dead cards

      ...PrintCol.countClaz(48, p1_75),  // 48 00-47
    ] as CountClaz;                      // 80

    const cardSingle_1_75_base_back = [
      ...CursusBack.countClaz(48, '00Back', p1_75, 'Cursus\nHonorum'),
      ...CursusBack.countClaz(16, '60Back', p1_75, 'Cursus\nHonorum'),
      // double-sided
      ...BlackCard.countClaz(6, p1_75),  //  6 Black cards (blank)
      ...WhiteCard.countClaz(6, p1_75),  //  6 Col0N cards (col nums)
      ...PrintSpecial.countClaz(4),      //  4 DeadCards
    ] as CountClaz[];

    const cardSingle_1_75_hand = arrayN(nplyr).flatMap(f => [
      // 9 groups of 12 cards: bid, col, dead office
      ...PrintBidValue.countClaz(4, f, p1_75),
      ...PrintColSelect.countClaz(ncol, f, p1_75),
    ]) as CountClaz[];                  // 80

    const cardSingle_1_75_hand_back = arrayN(nplyr).flatMap(pid => [
      // 8 groups of 10 cards: 4-bid, 6-col
      ...[[4, CursusBack, `Hand${pid}_BidBack`, 4, p1_75, '', Player.playerColor(pid)]], // solid color
      ...[[ncol, CursusBack, `Hand${pid}_ColBack`, ncol, p1_75, '', Player.playerColor(pid)]], // solid color
    ]) as CountClaz[];                  // 80

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

    // ColCard.gridSpec set the aspect ratio (ColCard.getWH) for all the ColCard derivatives:
    const pageSpecs: PageSpec[] = [];
    // this.clazToTemplate(labelCols, TrackLabel.gridSpec, pageSpecs)
    // this.clazToTemplate(cardSingle_3_5_track, ColCard.gridSpec = Statics.cardSingle_3_5_px, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_hand_back, ColCard.gridSpec = Statics.cardSingle_1_75_px, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_base_back, ColCard.gridSpec = Statics.cardSingle_1_75_px, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_hand, ColCard.gridSpec = Statics.cardSingle_1_75_px, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_base, ColCard.gridSpec = Statics.cardSingle_1_75_px, pageSpecs);
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd

  //[Screentop](https://screentop.gg/) or [PlayingCards IO](https://playingcards.io/).
