import type { Meta, StoryObj } from '@storybook/react-vite';
import { OriginCasePage } from './origin/OriginCasePage';

const meta = {
  title: '1. 组件案例',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    actions: { disable: true }
  }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeroGlass: Story = {
  name: '1.1 Hero Glass',
  render: () => <OriginCasePage studyCase="hero" />
};

export const Switch: Story = {
  name: '1.2 Switch',
  render: () => <OriginCasePage studyCase="switch" />
};

export const Slider: Story = {
  name: '1.3 Slider',
  render: () => <OriginCasePage studyCase="slider" />
};

export const SegmentedToggle: Story = {
  name: '1.4 Segmented Toggle / Tab 药丸',
  render: () => <OriginCasePage studyCase="toggle" />
};
