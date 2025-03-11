import { C } from "@thegraid/common-lib";
import { PaintableShape } from "@thegraid/easeljs-lib";
import { TP as TPLib, playerColorRecord } from "@thegraid/hexlib";

declare type Params = Record<string, any>;

export class TP extends TPLib {
  static {
    const tp = TPLib;
    // do not 'override' --> set lib value
    tp.useEwTopo = true;
    tp.maxPlayers = 9;       // playerPanel for 6,7,8 overlap
    tp.numPlayers = 2;
    tp.cacheTiles = 2.5;
    tp.bgColor = 'rgba(200, 120, 40, 0.8)';
    PaintableShape.defaultRadius = tp.hexRad;
  }
  static override setParams(qParams?: Params, force?: boolean, target?: Params) {
    const TP0 = TP, TPlib = TPLib; // inspectable in debugger
    const rv = TPLib.setParams(qParams, force, target); // also set in local 'override' copy.
    // console.log(`TP.setParams:`, { qParams, TP0, TPlib, ghost: TP.ghost, gport: TP.gport, networkURL: TP.networkUrl });
    return rv;
  }

  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150


  static override meepleY0 = 0;

  /** ratio of 'dual' 2-in-a-box Cards */
  static rDuals = .3;
  /** [true] no scoreForColor unless winnerMeep lands on a faction of bidCard. */
  static bidReqd = true;
  static nElts = 6;     // number of ScoreTrack elements
  static trackSegs?: string[]; // anames of each TrackSegment in use; nElts = trackSegs.length

  /** when advance: always bump down (by 2); self-bump is always up (by 1) */
  static allBumpsDown = true;
  /** must bump row1 to row0 */
  static bumpUpRow1 = true;
  /** [true] scoreForRank scores at most 1 meep per player on each rank */
  static onePerRank = false;
  /** score only for your highest rank */
  static topRankOnly = false;
  /** score only the top n meeps */
  static nTopMeeps = 3;
  /** enable textLog in scoreForColor */
  static logFromSubGame = false;
  /** true -> show auto_bids when selected; false -> show after make-bids done click. */
  static showAllBids = false;
  /** use extra meeple if player count <= useXtraMeep */
  static useXtraMeep = 4;
}
