const fs = require('fs');

let index = fs.readFileSync('src/web/pages/index.mjs', 'utf8');
if (!index.includes('register-illustration')) {
    index = index.replace('<div class="register-copy">', '<div class="register-illustration" style="text-align: center; margin-bottom: 24px;"><img src="/public/assets/figma/book_lover_mkck.svg" alt="" style="max-height: 120px; width: auto;"></div>\n                  <div class="register-copy">');
    fs.writeFileSync('src/web/pages/index.mjs', index);
}

let game = fs.readFileSync('C:/Users/Marcelo/Downloads/batalha_prompt/game.php', 'utf8');
if (!game.includes('register-illustration')) {
    game = game.replace('<div class="register-copy">', '<div class="register-illustration" style="text-align: center; margin-bottom: 24px;"><img src="public/assets/figma/book_lover_mkck.svg" alt="" style="max-height: 120px; width: auto;"></div>\n                  <div class="register-copy">');
    fs.writeFileSync('C:/Users/Marcelo/Downloads/batalha_prompt/game.php', game);
}
console.log('Added registration illustration');
