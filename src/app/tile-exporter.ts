import { arrayN } from "@thegraid/common-lib";
import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz, type GridSpec } from "@thegraid/easeljs-lib";
import { CardButton, ColButtonBack, ColSelButton, PrintBidValue, PrintColSelect } from "./card-button";
import { BlackCard, ColCard, CoverCard, CursusBack, DetailCard, EoGCard, LayoutCard, PrintCol, PrintDual, PrintSpecial, RulesCard, SummaryCard, TextCard, WhiteCard } from "./col-card";
import { TrackLabel, TrackSegment } from "./col-table";
import { Player } from "./player";
import { Statics } from "./statics";
// end imports

export class TileExporter extends TileExporterLib {
  constructor(pageMaker = ImageGrid) {
    super(pageMaker);
    this.imageGrid.setScale('.05');  // start small
  }

  override clazToTemplate(countClaz: CountClaz[], gridSpec?: GridSpec, pageSpecs?: PageSpec[], open?: boolean, baseName = ''): PageSpec[] {
    const rv = super.clazToTemplate(countClaz, gridSpec, pageSpecs, open)
    rv.forEach(ps => ps.basename = ps.basename ?? baseName);
    return rv;
  }

  override makeImagePages() {
    const ncol = 6;
    const nplyr = 8;
    const track_grid = Statics.cardSingle_trump_px;
    const card_grid = Statics.cardSingle_1_75_px;

    // MPC: min size: 597 x 822 pixels (300DPI) 1.99 x 2.74; 2.0 (600?) x 2.75 (825?)
    // MPC: 555 x 816 !?
    const dpi = 300, p3_5 = 3.5 * dpi, p2_5 = 2.5*dpi, cSize = card_grid.cardh!*(card_grid.dpi ?? 1); // bleed*2 = .25
    // [TileExporter.cardSingle_1_75_in, TileExporter.cardSingle_3_5_in].forEach(ig => ig.dpi = dpi);
    // [...[count, claz, ...constructorArgs]]

    // 3 Cover + 12 Track + 3 Summary = 18 @ $ 10.95 (MPC)
    // 2D + 1S + 12 Detail + 3 Detail
    const cardSingle_3_5_track = [
      // FRONTS:
      ...[[1, LayoutCard, 'ALayout', track_grid.cardh, 0]],
      ...RulesCard.countClaz(3, 'BRules', track_grid.cardh),
      ...SummaryCard.countClaz(4, 'CSummary', track_grid.cardh),

      ...CoverCard.countClaz(2, 'DCover', track_grid.cardh),
      ...TrackSegment.countClaz(12, track_grid),  // 'T...'
      ...[[2, TextCard, 'UU', track_grid.cardh]],
      // BACKS:
      ...[[1, LayoutCard, 'VLayout', track_grid.cardh, 1, 180]],
      ...DetailCard.countClaz(3, 'WDetail', track_grid.cardh),
      ...EoGCard.countClaz(4, 'XEoG', track_grid.cardh),

      ...DetailCard.countClaz(2, 'YDetail', track_grid.cardh),
      ...DetailCard.countClaz(12, 'ZDetail', track_grid.cardh, undefined, undefined, 5),
    ] as CountClaz[];

    // 16(D) 48(C) 18(B, W, SD) = 82;
    // 7 player * 11 (bid/col)  = 77; 159 <-- Straight up = 25.15
    // 12 Track & 3 Summary & 3 Detail   // 18 @ 10.95

    // 6 Special, 3 small Summary + 9 * (12 bid/sel) 9*12 = 108; 9 * 13 = 121 + 78 = 199!
    // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!

    // 7 * (10 bid/sel) 7*10 = 70; 9 * 13 = 121 + 78 = 199!
    // Player bag: 4 (bid) 7 (sel) 11 * 9 = 99 cards!

    const cardSingle_1_75_base = [
      ...PrintCol.countClaz(48, cSize),  // 48 00-47
      ...PrintDual.countClaz(16, cSize), // 16 60-75

      ...WhiteCard.countClaz(6, cSize),  //  6 Col0N cards (col nums)
      ...PrintSpecial.countClaz(10),     //  4 Dead cards (backs are black)

    ] as CountClaz;                      // 80

    const cardSingle_1_75_base_back = [
      ...CursusBack.countClaz(48, '00Back', cSize, 'Cursus\nHonorum'),
      ...CursusBack.countClaz(16, '60Back', cSize, 'Cursus\nHonorum'),
      // double-sided
      ...WhiteCard.countClaz(6, cSize, 180),  //  6 Col0N cards (col nums) [rotate 180!]
      ...BlackCard.countClaz(10, cSize, 'Dblack'),  // 10 Black cards (blank) back of SpecialDead
    ] as CountClaz[];

    const cardSingle_1_75_hand = arrayN(nplyr).flatMap(pid => [
      // 9 groups of 12 cards: bid, col, dead office
      ...PrintBidValue.countClaz(4, pid, cSize),
      ...PrintColSelect.countClaz(ncol, pid, cSize),
    ]) as CountClaz[];                  // 80

    // ColButton with altRectShape(strokec = bgColor)
    const cbb_opts = (pid: number)  => (
      { player: { index: pid },
        bgColor: Player.playerColor(pid),
        strokec: Player.playerColor(pid),
        radius: ColSelButton.getWH(undefined, true).w,
        visible: true,
      }
    );
    const cardSingle_1_75_hand_back = arrayN(nplyr).flatMap(pid => [
      ...ColButtonBack.countClaz(4 + ncol, cbb_opts(pid)), // nplyr (8) groups of 10 cards: 4-bid, 6-col
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
    // this.clazToTemplate(labelCols, track_grid, pageSpecs)
    this.clazToTemplate(cardSingle_3_5_track, ColCard.gridSpec = TrackSegment.gridSpec = track_grid, pageSpecs, false, 'Track');
    // this.clazToTemplate(cardSingle_1_75_hand, CardButton.gridSpec = card_grid, pageSpecs, false, 'Front');
    // this.clazToTemplate(cardSingle_1_75_base, ColCard.gridSpec = card_grid, pageSpecs, false, 'Front');
    // this.clazToTemplate(cardSingle_1_75_hand_back, CardButton.gridSpec = card_grid, pageSpecs, false, 'Backs');
    // this.clazToTemplate(cardSingle_1_75_base_back, ColCard.gridSpec = card_grid, pageSpecs, false, 'Backs');
    return pageSpecs;
  }

}

  // The Game Crafter: https://www.thegamecrafter.com/
  // MPCC:  https://www.makeplayingcards.com/  (create folder with 18 cards, front & back)
  // ImageMagick to convert from .png to .psd

  //[Screentop](https://screentop.gg/) or [PlayingCards IO](https://playingcards.io/).
