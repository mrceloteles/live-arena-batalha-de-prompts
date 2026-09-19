import fs from 'fs';

const svgCrisp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 330 65" width="330" height="65">
  <!-- Icon: >_ -->
  <path d="M 20 20 L 45 40 L 20 60" fill="none" stroke="#004ced" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
  <line x1="52" y1="60" x2="78" y2="60" stroke="#fae100" stroke-width="9" stroke-linecap="round" />
  
  <!-- Text: LIVE ARENA -->
  <text x="96" y="49" font-family="'Google Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="38" letter-spacing="-0.5" fill="#1e293b">
    LIVE <tspan fill="#004ced">ARENA</tspan>
  </text>
  
  <text x="98" y="67" font-family="'Google Sans', 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="12" letter-spacing="2.5" fill="#64748b">
    BATALHA DE PROMPTS
  </text>
</svg>`;

const svgWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 330 65" width="330" height="65">
  <!-- Icon: >_ -->
  <path d="M 20 20 L 45 40 L 20 60" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
  <line x1="52" y1="60" x2="78" y2="60" stroke="#fae100" stroke-width="9" stroke-linecap="round" />
  
  <!-- Text: LIVE ARENA -->
  <text x="96" y="49" font-family="'Google Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="38" letter-spacing="-0.5" fill="#ffffff">
    LIVE <tspan fill="#ffffff" opacity="0.85">ARENA</tspan>
  </text>
  
  <text x="98" y="67" font-family="'Google Sans', 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="12" letter-spacing="2.5" fill="#ffffff" opacity="0.8">
    BATALHA DE PROMPTS
  </text>
</svg>`;

const dirs = [
  'public/assets/figma',
  'C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/figma'
];

dirs.forEach(d => {
  fs.writeFileSync(`${d}/live-arena-logo.svg`, svgCrisp);
  fs.writeFileSync(`${d}/live-arena-logo-muted.svg`, svgCrisp); // Replace muted with crisp bold version!
  fs.writeFileSync(`${d}/live-arena-logo-white.svg`, svgWhite);
});

console.log('Logos upgraded to tight viewBox and bold presence!');
