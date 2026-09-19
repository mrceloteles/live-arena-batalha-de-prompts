<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tela Principal - Descubra o Prompt</title>
    <link rel="stylesheet" href="public/assets/css/app.css?v=1787236246">
</head>
<body
    data-page="main"
    data-room="main"
    data-duration="60"
    data-round-results-duration="10"
    data-final-results-duration="30"
    data-reset-at="1787680471"
>
    <main class="main-shell">
        <header class="tv-topbar">
            <img class="battle-prompt-logo battle-prompt-logo-muted" src="public/assets/figma/battle-prompt-muted.png" alt="Batalha de Prompt">
            <div class="tv-clock">02:47</div>
            <img class="google-startups-logo google-startups-logo-muted" src="public/assets/figma/google-startups-muted.png" alt="Google for Startups">
        </header>

        <section class="main-stage is-active" data-main-stage="idle">
            <img class="google-startups-logo google-startups-logo-white tv-idle-google" src="public/assets/figma/google-startups-white.png" alt="Google for Startups">
            <div class="tv-idle-card battle-card">
                <span class="yellow-tape" aria-hidden="true"></span>
                <div class="battle-logo battle-logo-hero">
                    <span>Batalha de</span>
                    <strong>PROMPT</strong>
                </div>
                <span class="pink-scribble" aria-hidden="true"></span>
            </div>
        </section>

        <section class="main-stage" data-main-stage="registration">
            <div class="tv-wait-card battle-card">
                <span class="yellow-tape" aria-hidden="true"></span>
                <img class="wait-illustration" src="public/assets/figma/tv-waiting-players-illustration.png" alt="">
                <div class="tv-wait-copy">
                    <h1>Aguardando jogadores</h1>
                    <p>
                        <span>Faça o seu cadastro na sua tela e, ao final, clique em avançar!</span>
                    </p>
                    <div class="main-player-grid main-player-grid-large" data-main-registration-players></div>
                </div>
            </div>
        </section>

        <section class="main-stage" data-main-stage="instructions">
            <div class="tv-instructions-card battle-card">
                <span class="yellow-tape" aria-hidden="true"></span>
                <aside class="tv-instructions-players">
                    <h2>Lista de Jogadores</h2>
                    <div class="main-player-grid main-player-grid-large" data-main-instructions-players></div>
                </aside>
                <div class="tv-instructions-copy">
                    <img class="tv-instructions-illustration" src="public/assets/figma/manual-instructions-illustration.png" alt="">
                    <h1>Como funciona a batalha</h1>
                    <p>
                        <span>Serão 3 rounds, 3 desafios. Em cada rodada, você verá uma imagem, seu desafio é chegar o mais perto possível do prompt original que a gerou. Leia os detalhes, seja estratégico e afiado. Aqui, precisão é tudo.</span>
                        <br>
                        <span>Quem vence? Quem chegar mais próximo do prompt correto nas 3 rodadas leva o título. Prepare-se, a batalha vai começar!</span>
                    </p>
                </div>
            </div>
        </section>

        <section class="main-stage" data-main-stage="playing">
            <div class="main-image-layout">
                <div class="main-image-frame">
                    <img data-main-image src="public/assets/figma/prompt-sample.png" alt="Imagem da rodada">
                </div>
                <aside class="main-side-panel">
                    <div class="main-side-header">
                        <div class="main-round-label">
                            <span>Rodada</span>
                            <strong data-main-round>01/03</strong>
                        </div>
                        <div class="main-avatar-stack" data-main-avatar-stack aria-hidden="true"></div>
                    </div>
                    <div class="main-progress-list" data-main-progress></div>
                </aside>
            </div>
        </section>

        <section class="main-stage" data-main-stage="results">
            <div class="tv-results-card battle-card">
                <span class="yellow-tape" aria-hidden="true"></span>
                <div class="main-stage-heading">
                    <h1 data-main-results-title>Veja o Ranking do 1º Round!</h1>
                    <span class="pink-scribble" aria-hidden="true"></span>
                    <p class="main-tie-breaker" data-main-tie-breaker hidden></p>
                </div>
                <div class="main-round-ranking" data-main-round-ranking></div>
            </div>
        </section>
    </main>
    <script src="public/assets/js/app.js?v=1787867258"></script>
</body>
</html>
