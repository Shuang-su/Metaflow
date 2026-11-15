// All dimensions are metres in the existing calibrated room coordinate system.
// Keep coplanar panel fronts from overlapping the vertical trims, especially on
// narrow phone viewports where the overlap otherwise produces visible z-fighting.
export function wallDetailLayout(width){
  if(!Number.isFinite(width)||width<.02)throw new RangeError('Room width must be at least 0.02 m');
  const trimThickness=.002;
  const wallGap=Math.min(.0004,width*.006);
  const panelMargin=wallGap+trimThickness+.001;
  const panelSpan=width-2*panelMargin;
  return {
    wallGap,trimThickness,
    wallSpan:width-2*wallGap,
    trimX:width/2-wallGap-trimThickness/2,
    panelWidth:panelSpan/5-.001,
    panelCenters:[-2,-1,0,1,2].map(i=>i*panelSpan/5)
  };
}
