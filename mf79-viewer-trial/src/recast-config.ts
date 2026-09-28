// World values come from the native 5.20.0 capsule and triangle-step calibration.
// 0.24 m passed all 15 tested width/heading combinations without a jump.
export const RECAST_CONFIG = {
  cs: 0.04,
  ch: 0.04,
  walkableSlopeAngle: 45,
  walkableHeight: 43,
  walkableRadius: 5,
  walkableClimb: 6,
  minRegionArea: 0,
  mergeRegionArea: 0,
  maxSimplificationError: 0.5,
  maxEdgeLen: 100,
  detailSampleDist: 12,
  detailSampleMaxError: 1,
};
