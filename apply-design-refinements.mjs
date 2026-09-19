import fs from 'fs';

const refinements = `
/* --- Design QA Refinements: Premium Web Design Standards --- */

/* 1. Typography & Readability (Line-Height & Letter-Spacing) */
body[data-page=game] .manual-copy p,
body[data-page=game] .manual-copy p span,
body[data-page=game] .register-copy p,
body[data-page=game] .register-copy p span,
body[data-page=game] .wait-copy p,
body[data-page=game] .wait-copy p span,
body[data-page=game] .prompt-copy p,
body[data-page=main] .tv-instructions-copy p,
body[data-page=main] .tv-instructions-copy p span,
body[data-page=main] .tv-wait-copy p,
body[data-page=main] .tv-wait-copy p span {
  line-height: 1.55 !important;
  letter-spacing: -0.01em !important;
  display: inline-block !important;
  margin-bottom: 4px !important;
}

/* 2. Secondary & Tertiary Text Contrast (WCAG 2.1 AA Compliant) */
::placeholder {
  color: #70757a !important;
  opacity: 1 !important;
}

::-webkit-input-placeholder {
  color: #70757a !important;
}

.text-field input::placeholder,
.prompt-form textarea::placeholder {
  color: #70757a !important;
}

.text-field span,
.prompt-copy span,
.game-info span {
  color: #5f6368 !important;
}

/* 3. Mobile Touch Targets & Micro-Interactions */
@media (max-width: 768px) {
  .nav-action,
  .help-button,
  .image-help,
  .ghost-link {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 8px 14px !important;
    touch-action: manipulation;
  }

  .lgpd-check {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
  }

  .lgpd-check input[type="checkbox"] {
    min-width: 22px !important;
    min-height: 22px !important;
  }
}

/* 4. Smooth Focus Rings & Micro-Transitions */
.figma-cta,
.nav-action,
.help-button,
.send-button,
.text-field input,
.prompt-form textarea {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.text-field input:focus,
.prompt-form textarea:focus {
  border-color: #004ced !important;
  box-shadow: 0 0 0 3px rgba(0, 76, 237, 0.18) !important;
  outline: none !important;
}

.figma-cta:active,
.send-button:active {
  transform: scale(0.98) !important;
}

/* 5. Bugfix: Ensure form-message never overlaps the Avançar button */
body[data-page=game] .screen[data-screen=register] .register-form {
  position: relative !important;
}

body[data-page=game] .screen[data-screen=register] .form-message {
  position: static !important;
  display: block !important;
  margin-top: 12px !important;
  margin-bottom: 6px !important;
  min-height: 20px !important;
  text-align: right !important;
  color: #d93025 !important;
  font-size: 13px !important;
  font-weight: 600 !important;
}

body[data-page=game] .screen[data-screen=register] .form-footer {
  position: static !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-top: 8px !important;
  width: 100% !important;
}
`;

const paths = [
  'public/assets/css/app-authorial.css',
  'C:/Users/Marcelo/Downloads/batalha_prompt/public/assets/css/app-authorial.css'
];

for (const p of paths) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    if (content.includes('/* --- Design QA Refinements: Premium Web Design Standards --- */')) {
      content = content.split('/* --- Design QA Refinements: Premium Web Design Standards --- */')[0];
    }
    content += '\n' + refinements;
    fs.writeFileSync(p, content);
    console.log('Updated CSS with form-message fix:', p);
  }
}
