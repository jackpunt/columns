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
  /** number of TrackSegments to use on ScoreTrack */
  static nElts = 6;
  /** identify the TrackSegments in use */
  static trackSegs?: string[]; // anames of each TrackSegment in use; nElts = trackSegs.length
  /** when numPlayers < 5: [true -> ABCD] [false -> use AB_DE] */
  static fourBase = true;

  /** when advance: always bump down (by 2); self-bump is always up (by 1) */
  static allBumpsDown = true;
  /** must bump row1 to row0 */
  static bumpUpRow1 = true;
  /** [true] scoreForRank scores at most 1 meep per player on each rank */
  static onePerRank = false;
  /** score only for your highest rank */
  static topRankOnly = false;
  /** score only the top/first n meeps */
  static nTopMeeps = 2;
  /** move one ScoreMarker per rank (vs one per meep) */
  static scorePerMeep = true;
  /** enable textLog in scoreForColor & parseScenario */
  static logFromSubGame = false;
  /** true -> show auto_bids when selected; false -> show after make-bids done click. */
  static showAllBids = false;
  /** use extra meeple if player count <= useXtraMeep */
  static useXtraMeep = 4;
  /** setAutoPlay unless startManual includes colorName */
  static startManual = ['grey'];
  /** enable/disable auto bots */
  static autoStart = true;
  /** for non-auto Players */
  static autoScore = false;
  /** meeple-drop --> click doneButton (doneButton: "advance & bump your highlighted meeple") */
  static autoDrop = true;
  /** true to use PryTopo and layout */
  static usePyrTopo = true;
  /** total ColCards to shuffle & display */
  static cardsInPlay = 31;
}
