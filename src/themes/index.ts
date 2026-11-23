import { AmbientTheme } from './ambient';
import { PsychedelicTheme } from './psychedelic';
import type { Theme } from './types';

export const THEMES: { id: string; name: string; description: string; create: () => Theme }[] = [
  {
    id: 'psychedelic',
    name: 'Psychedelic',
    description: 'Infinitely zooming spiral of shapes',
    create: () => new PsychedelicTheme(),
  },
  {
    id: 'ambient',
    name: 'Ambient',
    description: 'Slow drifting light, soft edges',
    create: () => new AmbientTheme(),
  },
];
