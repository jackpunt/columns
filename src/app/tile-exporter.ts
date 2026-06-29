import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz } from "@thegraid/easeljs-lib";
import { BlackCard, PrintCol, PrintDual, PrintSpecial, SetupCard, SummaryCard } from "./col-card";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { TrackLabel, TrackSegment } from "./col-table";
import { arrayN } from "@thegraid/common-lib";
// end imports

export class TileExporter extends TileExporterLib {

  override makeImagePages() {
    // [...[count, claz, ...constructorArgs]]
    const cardSingle_3_5_track = [
      [12, TrackSegment, '', 1050 / 9, 750 / 2],
      [3, SetupCard, '野心', 750],
      [3, SetupCard, '"利刃出击"', 750], //  '"利刃出击"' // (Blades Strike: "Knives Out")
    ] as CountClaz[];
    const cardSingle_1_75_back = [
      [36, SetupCard, '"利刃出击"'],   // card back if we want it.
    ] as CountClaz[];
    const cardSingle_1_75_base = [
      ...BlackCard.countClaz(7, 0),  // black cards (blank)
      ...BlackCard.countClaz(7, 1),  // white cards (col nums)
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
    ];

    const pageSpecs: PageSpec[] = [];
    // this.clazToTemplate(labelCols, TrackLabel.gridSpec, pageSpecs)
    // this.clazToTemplate(cardSingle_3_5_track, ImageGrid.cardSingle_3_5, pageSpecs);
    // this.clazToTemplate(cardSingle_1_75_back, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_base, ImageGrid.cardSingle_1_75, pageSpecs);
    this.clazToTemplate(cardSingle_1_75_hand, ImageGrid.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd
