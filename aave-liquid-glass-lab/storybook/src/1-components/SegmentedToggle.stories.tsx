import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImplementationGuidePage } from '../guides/ImplementationGuidePage';

const meta = {
  title: '1. 组件案例/1.4 Segmented Toggle',
  parameters: { layout: 'fullscreen', controls: { disable: true }, actions: { disable: true } }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Build: Story = {
  name: '构建与代码',
  render: () => <ImplementationGuidePage studyCase="toggle" />
};
