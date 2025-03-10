import { F } from "@thegraid/common-lib";
import type { Paintable } from "@thegraid/easeljs-lib";
import { Meeple, type MeepleShape as MeepleShapeLib, type Player as PlayerLib, type DragContext, type Hex1, type IHex2 } from "@thegraid/hexlib";
import type { ColCard } from "./col-card";
import type { Faction } from "./game-play";
import type { GameState } from "./game-state";
import { MeepleShape } from "./meeple-shape";
import { OrthoHex2 } from "./ortho-hex";
import type { Player } from "./player";
import { TP } from "./table-params";


export class ColMeeple extends Meeple {

  declare player: Player;
  declare baseShape: MeepleShapeLib & { highlight(l?: boolean, u?: boolean): void; };
  declare fromHex: OrthoHex2;

  constructor(Aname: string, player?: Player) {
    super(Aname, player);
    this.nameText.font = F.fontSpec(this.radius / 6);
    this.nameText.y -= 3;
    // console.log(stime(`ColMeeple: constructor`), this);
  }
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
    if (!['AdvanceAndBump', 'ResolveWinner'].includes(state!) && !ctx.lastShift)
      return `Only move during Bump phase, not "${state}"`;
    const col = (ctx.gameState as GameState).gamePlay.colToMove;
    const colc = this.card.col;
    return (colc == col || ctx.lastShift) ? undefined : `Only move from column ${col}, not ${colc}`;
  }

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    if (!(toHex instanceof OrthoHex2)) return false;
    if (ctx.lastShift && ctx.lastCtrl) return true; // can shift cols with Ctrl
    if (!(toHex.col === this.hex!.col)) return false; // stay in same hex-column
    if (ctx.lastShift) return true;
    // if (toHex === this.fromHex) return true;
    if (!(ctx.gameState.isPhase('AdvanceAndBump'))) return false;
    return true;
  }

  // hex.card.addMeep(this)
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (targetHex instanceof OrthoHex2) {
      const card = targetHex.card!; // ASSERT: every hex has a card
      const xy = this.parent.localToLocal(this.x, this.y, card.meepCont);
      if (this.player.adviseMeepleDrop(this, targetHex, ctx, xy)) return;
      card.addMeep(this, undefined, xy); // drop
    } else {
      super.dropFunc(targetHex, ctx); // never
    }
  }
}
