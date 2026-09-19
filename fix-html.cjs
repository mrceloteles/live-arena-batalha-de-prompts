const fs = require('fs');

const files = ['src/web/pages/index.mjs', 'C:/Users/Marcelo/Downloads/batalha_prompt/game.php'];

for (const file of files) {
    let c = fs.readFileSync(file, 'utf8');

    // Remove the old injected illustration that broke the grid
    c = c.replace('<div class="register-illustration" style="text-align: center; margin-bottom: 24px;"><img src="/public/assets/figma/book_lover_mkck.svg" alt="" style="max-height: 120px; width: auto;"></div>\n                  <div class="register-copy">', '<div class="register-copy">');
    c = c.replace('<div class="register-illustration" style="text-align: center; margin-bottom: 24px;"><img src="public/assets/figma/book_lover_mkck.svg" alt="" style="max-height: 120px; width: auto;"></div>\n                  <div class="register-copy">', '<div class="register-copy">');

    // Also remove if it had manual-illustration
    c = c.replace('<div class="register-illustration" style="text-align: center; margin-bottom: 24px;"><img src="/public/assets/figma/manual-illustration.svg" alt="" style="max-height: 120px; width: auto;"></div>\n                  <div class="register-copy">', '<div class="register-copy">');
    
    // Inject properly inside register-copy
    if (!c.includes('register-illustration')) {
        c = c.replace('<div class="register-copy">', '<div class="register-copy">\n                      <div class="register-illustration" style="text-align: center; margin-bottom: 12px;"><img src="/public/assets/figma/manual-illustration.svg" alt="" style="max-height: 100px; width: auto; margin: 0 auto;"></div>');
    }

    fs.writeFileSync(file, c);
}
console.log('Fixed HTML layout');
