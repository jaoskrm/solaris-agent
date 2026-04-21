const fs = require('fs');
const babel = require('@babel/core');

const code = fs.readFileSync('frontend/src/pages/Swarm.tsx', 'utf-8');
try {
  babel.parseSync(code, {
    filename: 'Swarm.tsx',
    presets: ['@babel/preset-react', '@babel/preset-typescript']
  });
  console.log('Parse successful!');
} catch (e) {
  console.error(e.message);
}
