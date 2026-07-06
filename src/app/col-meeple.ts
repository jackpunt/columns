import { F } from "@thegraid/common-lib";
import type { Paintable } from "@thegraid/easeljs-lib";
import { Meeple, type DragContext, type Hex1, type IHex2, type MeepleShape as MeepleShapeLib, type Player as PlayerLib } from "@thegraid/hexlib";
import type { ColCard } from "./col-card";
import type { GamePlay } from "./game-play";
import { MeepleShape } from "./meeple-shape";
import { ColHex2 } from "./ortho-hex";
import type { Player } from "./player";
import type { Faction } from "./statics";
import { TP } from "./table-params";


export class ColMeeple extends Meeple {

  declare gamePlay: GamePlay;
  declare player: Player;
  declare baseShape: MeepleShapeLib & { highlight(l?: boolean, u?: boolean): void; };
  declare fromHex: ColHex2;

  constructor(cid: string, player: Player) {
    const pcid = `${player.index}${cid}`
    super(`Meep-${pcid}`, player);
    this.pcid = pcid;
    this.nameText.font = F.fontSpec(this.radius / 6);
    this.nameText.y -= 3;
    // console.log(stime(`ColMeeple: constructor`), this);
  }
  /** 2 or 3 char id: `{player.index}${colNum}${ext}` */
  pcid: string;
  /** ColCard maintains: indicates which cell of card this meeple occupies; -> locXY */
  cellNdx?: number;
  /** ColCard on which this meeple is placed */
  card!: ColCard;
  /** faction of cell (of card) meeple is in/on. */
  faction?: Faction;
  override makeShape(): Paintable {
    const x = TP.hexRad / 2, y = x * (5 / 3);
    return new MeepleShape(this.player?.color ?? 'pink', { x, y });
  }

  override toString(): string {
    return `${super.toString()}#${this.cellNdx ?? '-'}`;
  }

  highlight(lightup = true, update = true) {
    this.baseShape.highlight(lightup, false); // set baseShape.visible = lightup
    this.updateCache();
    if (update) this.stage?.update();
  }

  get isMoveMeep() {
    return this.gamePlay.meepsToMove.includes(this); // also: !!meep.highlight
  }

  // called from Tile.dragFunc0()
  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    const { x, y } = this;
    const gxy = this.parent.localToGlobal(x, y)
    const card = (hex as ColHex2)?.card;
    const ndx = card?.cellNdxOfGlobalXY(gxy) ?? 0;
    const mark = card?.marks?.[ndx];
    ctx.targetHex?.map.showMark(ctx.targetHex, mark); // <-- super.showTargetMark;
  }

  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (!this.gamePlay.isMovePhase && !ctx.lastShift)
      return `Not allowed to move/bump in Phase: "${ctx.gameState.state.Aname}"`;
    // const okToMove = (ctx.gameState as GameState).gamePlay.meepsToMove.includes(this);
    return (this.isMoveMeep || ctx.lastShift) ? undefined : `Only move highlighted meeples`;
  }

  // unless cantBeMoved()
  //   table.dragStart() -> this.dragStart();
  //   markLegalHexes(tile) -> isLegalTarget(hex)

  override dragStart(ctx: DragContext): void {
    this.fromHex = this.card.hex;
    // set cardNdxs:
    this.cardNdxs = this.gamePlay.dragDirs.map(dir => {
      const nextCard = this.card.nextCard(dir);
      if (!nextCard) return undefined;
      if (this.gamePlay.isPhase('ResolveWinner')) {
        return this.gamePlay.cellsForAdvance(nextCard)
      }
      return this.gamePlay.cellsForBumpee(nextCard, dir); // TODO: restrict cells for Advance (Bumper)
    }).flat().filter(cardNdx => !!cardNdx);
  }
  // isLegalTarget for manuMoveBumpee; could be moved to gamePlay?
  cardNdxs: { card: ColCard, ndxs: number[] }[] = [];  // allowed bumpDirsA during manual move

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    const plyr = this.player;
    if (!(toHex instanceof ColHex2)) return false;
    if (ctx.lastShift && ctx.lastCtrl) return true; // can shift cols with Ctrl
    if (ctx.lastShift) return true;
    if (toHex === this.fromHex) return true;
    const toCard = toHex.card;
    if (!this.cardNdxs.find(({ card, ndxs }) => card == toCard)) return false;
    if (this.gamePlay.isMovePhase) return true;
    return false;
  }

  // hex.card.addMeep(this)
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (targetHex == this.fromHex) {
      this.card.addMeep(this, this.cellNdx);
      return
    }
    if (targetHex instanceof ColHex2) {
      const card = targetHex.card!; // ASSERT: every hex has a card
      const xy = this.parent.localToLocal(this.x, this.y, card.meepCont);
      if (this.player.adviseMeepleDropFunc(this, targetHex, ctx, xy)) return;
      card.addMeep(this, undefined, xy); // drop
    } else {
      super.dropFunc(targetHex, ctx); // never
    }
  }
}
