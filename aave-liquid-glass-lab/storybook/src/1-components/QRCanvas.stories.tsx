import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImplementationGuidePage } from '../guides/ImplementationGuidePage';
import { PipelineGuidePage } from '../guides/PipelineGuidePage';

const meta = {
  title: '1. 组件案例/1.5 QR Code／Canvas',
  parameters: { layout: 'fullscreen', controls: { disable: true }, actions: { disable: true } }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Build: Story = {
  name: '构建与代码',
  render: () => <ImplementationGuidePage studyCase="qr" />
};

export const Pipeline: Story = {
  name: 'WebGL 管线',
  render: () => <PipelineGuidePage studyCase="qr" />
};
