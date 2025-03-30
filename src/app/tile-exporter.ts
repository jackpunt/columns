import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz } from "@thegraid/easeljs-lib";
import { BlackCard, PrintCol, PrintDual, PrintSpecial, SetupCard, SummaryCard } from "./col-card";
import { PrintBidValue, PrintColSelect } from "./card-button";
import { TrackLabel, TrackSegment } from "./col-table";
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
      ...[[4, PrintSpecial, 'Special', 525]],
      ...BlackCard.countClaz(1),
      ...BlackCard.countClaz(7),
      ...BlackCard.countClaz(1),
      ...BlackCard.countClaz(7),
      ...PrintDual.countClaz(16),
      ...PrintCol.countClaz(36),
    ] as CountClaz;
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
      ...PrintColSelect.countClaz(7, 0, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 1, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 2, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 3, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 4, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 5, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 6, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 7, 525), ...BlackCard.countClaz(1),
      ...PrintColSelect.countClaz(7, 8, 525), [1, SummaryCard, 525],

      // [7, PrintColSelect, 7, 9, 525],
      // [2, PrintColSelect, 0, 9, 525],
    ] as CountClaz[];
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
    // this.clazToTemplate(cardSingle_1_75_hand, ImageGrid.cardSingle_1_75, pageSpecs);
    return pageSpecs;
  }

}
