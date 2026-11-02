// Regenerates the example cards shown in the README: npm run previews
import { writeFileSync, mkdirSync } from 'node:fs';
import { render } from '../src/render.js';

const sample = {
  isPlaying: true,
  track: 'Do I Wanna Know?',
  artist: 'Arctic Monkeys',
  recent: [
    { track: 'The Adults Are Talking', artist: 'The Strokes' },
    { track: 'Volta e Meia', artist: 'O Terno' },
    { track: 'Reptilia', artist: 'The Strokes' },
  ],
};

mkdirSync('previews', { recursive: true });
for (const theme of ['dark', 'light']) {
  writeFileSync(`previews/earworm-${theme}.svg`, render(theme, sample));
}
writeFileSync('previews/earworm-idle-dark.svg', render('dark', null));
console.log('previews written');
