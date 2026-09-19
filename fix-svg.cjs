const fs = require('fs');
const path = require('path');
const files = ['live-arena-logo.svg', 'live-arena-logo-muted.svg', 'live-arena-logo-white.svg'];
for (const file of files) {
    let content = fs.readFileSync(path.join('public', 'assets', 'figma', file), 'utf8');
    content = content.replace(/viewBox="0 0 400 80"/g, 'viewBox="0 0 500 80"');
    content = content.replace(/width="400"/g, 'width="500"');
    content = content.replace(/cx="35" cy="45" r="35"/g, 'cx="40" cy="40" r="35"');
    content = content.replace(/M 25 15 L 55 15 L 40 45 L 60 45 L 20 75 L 30 50 L 10 50 Z/g, 'M 30 10 L 60 10 L 45 40 L 65 40 L 25 70 L 35 45 L 15 45 Z');
    content = content.replace(/x="85" y="52"/g, 'x="95" y="50"');
    content = content.replace(/x="88" y="70"/g, 'x="98" y="68"');
    fs.writeFileSync(path.join('public', 'assets', 'figma', file), content);
    fs.writeFileSync(path.join('C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/figma', file), content);
}
console.log('Done');
