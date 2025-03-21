import { F } from "@thegraid/common-lib";
import type { Paintable } from "@thegraid/easeljs-lib";
import { Meeple, type MeepleShape as MeepleShapeLib, type Player as PlayerLib, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import type { ColCard } from "./col-card";
import type { Faction } from "./game-play";
import type { GameState } from "./game-state";
import { MeepleShape } from "./meeple-shape";
import { ColHex2 } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";
import type { ColId } from "./card-button";


export class ColMeeple extends Meeple {

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

  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    const state = ctx.gameState.state.Aname;
    if (!['BumpAndCascade', 'ResolveWinner'].includes(state!) && !ctx.lastShift)
      return `Only move during Bump phase, not "${state}"`;
    const okToMove = (ctx.gameState as GameState).gamePlay.meepsToMove;
    return (okToMove.includes(this) || ctx.lastShift) ? undefined : `Only move highlighted or its bumpee`;
  }

  // unless cantBeMoved()
  //   table.dragStart() -> this.dragStart();
  //   markLegalHexes(tile) -> isLegalTarget(hex)

  override dragStart(ctx: DragContext): void {
    this.player.setCardNdxs(this.card);
  }

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    const plyr = this.player;
    if (!(toHex instanceof ColHex2)) return false;
    if (ctx.lastShift && ctx.lastCtrl) return true; // can shift cols with Ctrl
    const colId = plyr.curSelCard?.colId ?? '';
    if (!(toHex.isInCol(colId))) return false; // stay in same hex-column
    if (ctx.lastShift) return true;
    // if (toHex === this.fromHex) return true;
    const toCard = toHex.card, cardNdxs = plyr.cardNdxs;
    if (!cardNdxs.find(({card, ndxs})=> card == toCard)) return false;
    if ((ctx.gameState.isPhase('ResolveWinner'))) return true; // meepleToAdvance
    if ((ctx.gameState.isPhase('BumpAndCascade'))) return true; // selectNdx_Bumpee
    return false;
  }

  isInCol(colId: ColId) {
    return this.card.isInCol[colId]
  }

  // hex.card.addMeep(this)
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
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
