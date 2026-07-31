import { DisplacementPlayground } from './DisplacementPlayground';
import { HeroGlassExample } from './HeroGlassExample';
import { QRCanvasExample } from './QRCanvasExample';
import { SliderExample } from './SliderExample';
import { SwitchExample } from './SwitchExample';
import { ToggleExample } from './ToggleExample';
import { VideoControlsExample } from './VideoControlsExample';

export type ReadableCaseId =
  | 'overview'
  | 'hero'
  | 'switch'
  | 'slider'
  | 'toggle'
  | 'qr'
  | 'video'
  | 'how-it-works';

export function ReadableExample({
  studyCase
}: {
  studyCase: ReadableCaseId;
}) {
  switch (studyCase) {
    case 'overview':
    case 'hero':
      return <HeroGlassExample />;
    case 'switch':
      return <SwitchExample />;
    case 'slider':
      return <SliderExample />;
    case 'toggle':
      return <ToggleExample />;
    case 'qr':
      return <QRCanvasExample />;
    case 'video':
      return <VideoControlsExample />;
    case 'how-it-works':
      return <DisplacementPlayground />;
  }
}
