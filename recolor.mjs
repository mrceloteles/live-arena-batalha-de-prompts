import fs from 'fs';

let css = fs.readFileSync('public/assets/css/app.css', 'utf8');

const replacements = {
  // Blues -> Violet
  '#0b84f3': '#7c3aed',
  '#1967d2': '#6d28d9',
  '#4285f4': '#8b5cf6',
  '#e8f0fe': '#f5f3ff',
  'rgba\\(66,133,244': 'rgba(139,92,246', // --blue rgb
  'rgba\\(11,132,243': 'rgba(124,58,237', 
  
  // Yellow Tape -> Orange/Tangerine
  '#fbbc04': '#f97316',
  
  // Pink Scribbles -> Cyan/Teal
  '#f48fb1': '#06b6d4',
  '#f58db2': '#0891b2',
  
  // Backgrounds
  '#f6f6f6': '#f8fafc', // slight cool slate tint instead of warm gray
};

for (const [oldColor, newColor] of Object.entries(replacements)) {
  const regex = new RegExp(oldColor, 'gi');
  css = css.replace(regex, newColor);
}

fs.writeFileSync('public/assets/css/app-authorial.css', css);
console.log('Created app-authorial.css');
