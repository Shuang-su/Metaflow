import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImplementationGuidePage } from './guides/ImplementationGuidePage';

const meta = {
  title: '2. Playground/2.1 How It Works · Displacement Map',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    actions: { disable: true }
  }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HowItWorks: Story = {
  name: '参数实验与代码',
  render: () => <ImplementationGuidePage studyCase="how-it-works" />
};
