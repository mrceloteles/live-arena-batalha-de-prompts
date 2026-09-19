import fs from 'fs';

// 1. Update src/web/pages/index.mjs
let indexMjs = fs.readFileSync('src/web/pages/index.mjs', 'utf8');

// Replace flow-topbar logo img to use live-arena-logo.svg with class flow-topbar-logo
indexMjs = indexMjs.replace(
  /<img class="google-startups-logo[^"]*" src="\/public\/assets\/figma\/live-arena-logo[^"]*" alt="[^"]*">/g,
  '<img class="google-startups-logo flow-topbar-logo" src="/public/assets/figma/live-arena-logo.svg" alt="Batalha de Prompts - Live Arena">'
);

// Replace register-copy structure in index.mjs
const oldRegisterPattern = /<div class="register-copy">[\s\S]*?<\/div>[\s\S]*?<form class="register-form"/;
const newRegisterStructure = `<div class="register-copy">
                    <div class="register-illustration">
                        <img src="/public/assets/figma/manual-illustration.svg" alt="Ilustração Cadastro" class="register-hero-img">
                    </div>
                    <div class="register-info-stack">
                        <div class="battle-logo battle-logo-small">
                            <span>Batalha de</span>
                            <strong>PROMPT</strong>
                        </div>
                        <h1>Fazer Cadastro</h1>
                        <p>Preencha os campos para criarmos seu cadastro na arena</p>
                    </div>
                </div>
                <form class="register-form"`;

if (oldRegisterPattern.test(indexMjs)) {
  indexMjs = indexMjs.replace(oldRegisterPattern, newRegisterStructure);
  fs.writeFileSync('src/web/pages/index.mjs', indexMjs);
  console.log('Updated src/web/pages/index.mjs');
}

// 2. Update PHP game.php
let gamePhpPath = 'C:/Users/Marcelo/Downloads/batalha_prompt/game.php';
if (fs.existsSync(gamePhpPath)) {
  let gamePhp = fs.readFileSync(gamePhpPath, 'utf8');
  gamePhp = gamePhp.replace(
    /<img class="google-startups-logo[^"]*" src="public\/assets\/figma\/live-arena-logo[^"]*" alt="[^"]*">/g,
    '<img class="google-startups-logo flow-topbar-logo" src="public/assets/figma/live-arena-logo.svg" alt="Batalha de Prompts - Live Arena">'
  );
  if (oldRegisterPattern.test(gamePhp)) {
    const phpRegisterStructure = newRegisterStructure.replace('/public/assets/', 'public/assets/');
    gamePhp = gamePhp.replace(oldRegisterPattern, phpRegisterStructure);
    fs.writeFileSync(gamePhpPath, gamePhp);
    console.log('Updated C:/Users/Marcelo/Downloads/batalha_prompt/game.php');
  }
}

// 3. Append Masterpiece CSS
const masterpieceCss = `
/* ========================================================
   PREMIUM REDESIGN: REGISTRATION SCREEN & CRAFT ELEVATION
   ======================================================== */

/* 1. Header & Live Arena Logo */
body[data-page=game] .flow-topbar,
body[data-page=main] .tv-topbar {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 24px 44px !important;
  position: relative !important;
  z-index: 10 !important;
}

body[data-page=game] .flow-topbar .nav-action {
  font-size: 15px !important;
  font-weight: 600 !important;
  color: #334155 !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  border-radius: 999px !important;
  padding: 8px 20px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

body[data-page=game] .flow-topbar .nav-action:hover {
  background: #f8fafc !important;
  transform: translateX(-2px) !important;
}

body[data-page=game] .flow-topbar .google-startups-logo,
body[data-page=game] .flow-topbar .google-startups-logo-muted,
body[data-page=game] .flow-topbar .flow-topbar-logo {
  position: static !important;
  display: block !important;
  height: 52px !important;
  max-height: 56px !important;
  width: auto !important;
  max-width: 300px !important;
  opacity: 1 !important;
  filter: none !important;
  object-fit: contain !important;
}

/* 2. Registration Card: Geometry, Breathing Room & Padding */
body[data-page=game] .screen[data-screen=register] .register-card {
  position: absolute !important;
  top: 52% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  display: grid !important;
  grid-template-columns: 44% 1fr !important;
  column-gap: 56px !important;
  width: min(1080px, 92vw) !important;
  max-width: 1080px !important;
  height: auto !important;
  min-height: 580px !important;
  padding: 48px 56px 44px 56px !important; /* Padding inferior generoso garantido! */
  background: #ffffff !important;
  border-radius: 24px !important;
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.03) !important;
  overflow: visible !important;
  align-items: center !important;
}

/* 3. Yellow Tape Element: Distinctive & Centered */
body[data-page=game] .screen[data-screen=register] .register-card .yellow-tape {
  position: absolute !important;
  top: -18px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: min(320px, 45%) !important;
  height: 36px !important;
  background: repeating-linear-gradient(135deg, #fae100 0 7px, transparent 7px 14px) !important;
  box-shadow: 0 4px 12px rgba(250, 225, 0, 0.4) !important;
  border-radius: 4px !important;
  z-index: 5 !important;
}

/* 4. Left Column: Prominent Illustration & Editorial Typography */
body[data-page=game] .screen[data-screen=register] .register-copy {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  padding: 10px 0 !important;
  gap: 0 !important;
  width: 100% !important;
}

body[data-page=game] .screen[data-screen=register] .register-illustration {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  width: 100% !important;
  margin-bottom: 20px !important;
}

body[data-page=game] .screen[data-screen=register] .register-hero-img,
body[data-page=game] .screen[data-screen=register] .register-illustration img {
  height: 185px !important;
  max-height: 200px !important;
  width: auto !important;
  max-width: 100% !important;
  object-fit: contain !important;
  filter: drop-shadow(0 10px 20px rgba(0, 76, 237, 0.1)) !important;
}

body[data-page=game] .screen[data-screen=register] .register-copy .battle-logo-small {
  display: inline-flex !important;
  flex-direction: column !important;
  align-items: center !important;
  margin-bottom: 12px !important;
  color: #003ec7 !important;
}

body[data-page=game] .screen[data-screen=register] .register-copy .battle-logo-small span {
  font-size: 13px !important;
  font-weight: 700 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  color: #64748b !important;
}

body[data-page=game] .screen[data-screen=register] .register-copy .battle-logo-small strong {
  font-size: 26px !important;
  font-weight: 900 !important;
  color: #004ced !important;
  letter-spacing: -0.03em !important;
  line-height: 1.1 !important;
}

body[data-page=game] .screen[data-screen=register] .register-copy h1 {
  font-size: 32px !important;
  font-weight: 700 !important;
  color: #0f172a !important;
  letter-spacing: -0.03em !important;
  line-height: 1.15 !important;
  margin: 0 0 10px 0 !important;
}

body[data-page=game] .screen[data-screen=register] .register-copy p {
  font-size: 15px !important;
  font-weight: 400 !important;
  color: #64748b !important;
  line-height: 1.5 !important;
  max-width: 320px !important;
  margin: 0 !important;
}

/* 5. Right Column: Form Fields, Spacing & Floating Polish */
body[data-page=game] .screen[data-screen=register] .register-form {
  display: flex !important;
  flex-direction: column !important;
  gap: 15px !important;
  width: 100% !important;
  padding: 0 !important;
}

body[data-page=game] .screen[data-screen=register] .text-field {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  margin: 0 !important;
}

body[data-page=game] .screen[data-screen=register] .text-field span {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #475569 !important;
}

body[data-page=game] .screen[data-screen=register] .text-field input {
  height: 50px !important;
  padding: 0 18px !important;
  font-size: 15px !important;
  color: #0f172a !important;
  background: #f8fafc !important;
  border: 1.5px solid #e2e8f0 !important;
  border-radius: 12px !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
  transition: all 0.2s ease !important;
}

body[data-page=game] .screen[data-screen=register] .text-field input:focus {
  background: #ffffff !important;
  border-color: #004ced !important;
  box-shadow: 0 0 0 4px rgba(0, 76, 237, 0.14) !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-field {
  margin-top: 4px !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-check {
  font-size: 13.5px !important;
  color: #475569 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-check input[type=checkbox] {
  width: 19px !important;
  height: 19px !important;
  accent-color: #004ced !important;
  border-radius: 4px !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-link {
  color: #004ced !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
  cursor: pointer !important;
}

/* 6. Form Footer: Solução Definitiva para "Quase Caindo" */
body[data-page=game] .screen[data-screen=register] .form-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-top: 20px !important;
  padding-top: 18px !important;
  border-top: 1px solid #f1f5f9 !important;
  width: 100% !important;
}

body[data-page=game] .screen[data-screen=register] .help-button {
  color: #64748b !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  background: transparent !important;
  border: 0 !important;
  cursor: pointer !important;
  padding: 8px 12px !important;
  border-radius: 8px !important;
  transition: color 0.15s ease, background 0.15s ease !important;
}

body[data-page=game] .screen[data-screen=register] .help-button:hover {
  color: #0f172a !important;
  background: #f1f5f9 !important;
}

body[data-page=game] .screen[data-screen=register] .figma-cta-blue {
  height: 48px !important;
  padding: 0 40px !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  color: #ffffff !important;
  background: #004ced !important;
  border-radius: 999px !important;
  border: 0 !important;
  box-shadow: 0 6px 20px rgba(0, 76, 237, 0.35) !important;
  cursor: pointer !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

body[data-page=game] .screen[data-screen=register] .figma-cta-blue:hover {
  background: #003ec7 !important;
  box-shadow: 0 8px 25px rgba(0, 76, 237, 0.45) !important;
  transform: translateY(-1px) !important;
}

body[data-page=game] .screen[data-screen=register] .figma-cta-blue:active {
  transform: translateY(1px) scale(0.98) !important;
}

body[data-page=game] .screen[data-screen=register] .form-message {
  position: static !important;
  display: block !important;
  margin: 8px 0 0 0 !important;
  text-align: right !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #dc2626 !important;
}

@media (max-width: 900px) {
  body[data-page=game] .screen[data-screen=register] .register-card {
    grid-template-columns: 1fr !important;
    row-gap: 32px !important;
    padding: 40px 24px 36px 24px !important;
    width: 94vw !important;
  }
}
`;

const cssPaths = [
  'public/assets/css/app-authorial.css',
  'C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/css/app-authorial.css'
];

for (const cp of cssPaths) {
  if (fs.existsSync(cp)) {
    let css = fs.readFileSync(cp, 'utf8');
    if (css.includes('/* ========================================================\n   PREMIUM REDESIGN: REGISTRATION SCREEN')) {
      css = css.split('/* ========================================================\n   PREMIUM REDESIGN: REGISTRATION SCREEN')[0];
    }
    css += '\n' + masterpieceCss;
    fs.writeFileSync(cp, css);
    console.log('Appended Masterpiece CSS to:', cp);
  }
}
