import type { Meta, StoryObj } from '@storybook/react-vite';
import { OriginCasePage } from '../origin/OriginCasePage';

const meta = {
  title: '1. 组件案例/1.5 QR Code／Canvas',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    actions: { disable: true }
  }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveDemo: Story = {
  name: '交互演示',
  render: () => <OriginCasePage studyCase="qr" />
};
