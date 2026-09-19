import fs from 'fs';

let css = fs.readFileSync('public/assets/css/app.css', 'utf8');

const replacements = {
  // Blues -> Stitch Primary (#003ec7 / #004ced)
  '#0b84f3': '#004ced',
  '#1967d2': '#003ec7',
  '#4285f4': '#0052ff',
  '#e8f0fe': '#f2f3ff', // surface-container-low
  'rgba\\(66,133,244': 'rgba(0,82,255', 
  'rgba\\(11,132,243': 'rgba(0,76,237', 
  
  // Yellow Tape -> Stitch Secondary (#fae100)
  '#fbbc04': '#fae100',
  
  // Pink Scribbles -> Stitch Tertiary (#cc0048)
  '#f48fb1': '#cc0048',
  '#f58db2': '#9f0036',
  
  // Backgrounds -> Stitch Surface (#faf8ff)
  '#f6f6f6': '#faf8ff',
};

for (const [oldColor, newColor] of Object.entries(replacements)) {
  const regex = new RegExp(oldColor, 'gi');
  css = css.replace(regex, newColor);
}

fs.writeFileSync('public/assets/css/app-authorial.css', css);
fs.writeFileSync('C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/css/app-authorial.css', css);
console.log('Created app-authorial.css with Stitch Theme');
