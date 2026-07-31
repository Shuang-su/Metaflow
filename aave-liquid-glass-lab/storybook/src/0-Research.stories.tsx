import type { Meta, StoryObj } from '@storybook/react-vite';
import { OriginCasePage } from './origin/OriginCasePage';

const meta = {
  title: '0. Web Liquid Glass：原理与实现',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    actions: { disable: true }
  }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Principles: Story = {
  name: '0.1 原理总览',
  render: () => <OriginCasePage studyCase="overview" />
};
