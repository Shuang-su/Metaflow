import type { Meta, StoryObj } from '@storybook/react-vite';
import { OriginCasePage } from './origin/OriginCasePage';

const meta = {
  title: '2. Playground',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    actions: { disable: true }
  }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HowItWorks: Story = {
  name: '2.1 How It Works / Displacement Map',
  render: () => <OriginCasePage studyCase="how-it-works" />
};
