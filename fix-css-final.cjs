const fs = require('fs');
const cssPaths = [
    'C:/Users/Marcelo/Downloads/batalha-de-prompts-main (1)/batalha-de-prompts-main/public/assets/css/app-authorial.css',
    'C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/css/app-authorial.css'
];
const newCss = `
/* --- Design QA Refinements: Premium Web Design Standards --- */

/* 1. Header & Live Arena Logo */
body[data-page=game] .flow-topbar-logo {
  position: static !important;
  display: block !important;
  height: 38px !important;
  width: auto !important;
  max-width: 250px !important;
  opacity: 1 !important;
  object-fit: contain !important;
  margin-top: 6px !important;
}

/* 2. Registration Card: Override fixed constraints */
body[data-page=game] .screen[data-screen=register] .register-card {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  display: grid !important;
  grid-template-columns: 42% 1fr !important;
  column-gap: 5% !important;
  width: min(1080px, 92vw) !important;
  max-width: 1080px !important;
  height: auto !important;
  min-height: 520px !important;
  max-height: 94svh !important;
  padding: 40px 50px 30px 50px !important;
  background: #ffffff !important;
  border-radius: 20px !important;
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.1) !important;
  overflow: hidden !important;
  align-items: stretch !important;
}

/* 3. Yellow Tape Element */
body[data-page=game] .screen[data-screen=register] .register-card .yellow-tape {
  position: absolute !important;
  top: -10px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: 240px !important;
  height: 20px !important;
  background: repeating-linear-gradient(135deg, #fae100 0 7px, transparent 7px 14px) !important;
  box-shadow: 0 2px 8px rgba(250, 225, 0, 0.4) !important;
  border-radius: 4px !important;
  z-index: 5 !important;
}

/* 4. Left Column: Illustration & Text */
body[data-page=game] .screen[data-screen=register] .register-copy {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: center !important;
  text-align: left !important;
  padding: 0 !important;
  gap: 12px !important;
  width: 100% !important;
}

body[data-page=game] .screen[data-screen=register] .register-illustration {
  display: flex !important;
  justify-content: flex-start !important;
  align-items: center !important;
  width: 100% !important;
  margin-bottom: 12px !important;
}

body[data-page=game] .screen[data-screen=register] .register-hero-img,
body[data-page=game] .screen[data-screen=register] .register-illustration img {
  height: 180px !important;
  width: auto !important;
  max-width: 100% !important;
  object-fit: contain !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack .battle-logo-small {
  align-items: flex-start !important;
  margin-bottom: 8px !important;
  color: #003ec7 !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack .battle-logo-small span {
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.05em !important;
  text-transform: uppercase !important;
  color: #64748b !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack .battle-logo-small strong {
  font-size: 22px !important;
  font-weight: 900 !important;
  color: #004ced !important;
  letter-spacing: -0.03em !important;
  line-height: 1.1 !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack h1 {
  font-size: 28px !important;
  font-weight: 700 !important;
  color: #0f172a !important;
  letter-spacing: -0.02em !important;
  line-height: 1.15 !important;
  margin: 0 0 6px 0 !important;
}

body[data-page=game] .screen[data-screen=register] .register-info-stack p {
  font-size: 14px !important;
  font-weight: 400 !important;
  color: #64748b !important;
  line-height: 1.4 !important;
  max-width: 280px !important;
  margin: 0 !important;
}

/* 5. Right Column: Form Fields */
body[data-page=game] .screen[data-screen=register] .register-form {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  gap: 12px !important;
  width: 100% !important;
  padding: 0 !important;
  height: auto !important;
}

body[data-page=game] .screen[data-screen=register] .text-field {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  margin: 0 !important;
}

body[data-page=game] .screen[data-screen=register] .text-field span {
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #475569 !important;
  position: static !important;
  background: transparent !important;
  padding: 0 !important;
  margin-left: 2px !important;
}

body[data-page=game] .screen[data-screen=register] .text-field input {
  height: 44px !important;
  padding: 0 14px !important;
  font-size: 14px !important;
  color: #0f172a !important;
  background: #f8fafc !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-field {
  margin-top: 4px !important;
}

body[data-page=game] .screen[data-screen=register] .lgpd-check {
  font-size: 13px !important;
  color: #475569 !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

/* 6. Form Footer (Precisa de ajuda + Avancar) */
body[data-page=game] .screen[data-screen=register] .form-footer {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-top: 10px !important;
  padding-top: 14px !important;
  border-top: 1px solid #f1f5f9 !important;
  width: 100% !important;
}

body[data-page=game] .screen[data-screen=register] .help-button {
  color: #64748b !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  padding: 6px 10px !important;
}

body[data-page=game] .screen[data-screen=register] .figma-cta-blue {
  height: 44px !important;
  padding: 0 32px !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  border-radius: 999px !important;
  background: #004ced !important;
}

@media (max-width: 900px) {
  body[data-page=game] .screen[data-screen=register] .register-card {
    grid-template-columns: 1fr !important;
    padding: 30px 20px !important;
    width: 94vw !important;
  }
}
`;

cssPaths.forEach(path => {
    if (fs.existsSync(path)) {
        let content = fs.readFileSync(path, 'utf8');
        const splitIndex = content.indexOf('/* --- Design QA Refinements: Premium Web Design Standards --- */');
        
        if (splitIndex !== -1) {
            content = content.substring(0, splitIndex) + newCss;
        } else {
            content = content + '\n' + newCss;
        }
        
        fs.writeFileSync(path, content, 'utf8');
        console.log('Updated ' + path);
    }
});
