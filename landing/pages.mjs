// The public pages of the site. Each one has its own title, description, canonical path and h1,
// and scripts/build-site.mjs wraps it in the shared layout (header, footer, meta, JSON-LD).
// Copy is plain and factual: no numbers that the app itself does not back.

export const SITE = {
  name: 'Série',
  tagline: 'O teu plano de treino, cada série.',
  // Filled in by the owner; the LocalBusiness block is only published once address is set.
  business: { legalName: '', street: '', postalCode: '', city: '', country: 'PT', phone: '', email: '' },
  repo: 'https://github.com/[O-TEU-UTILIZADOR]/serie'
}

const appCta = (label = 'Entrar na app') => `<a class="btn primary" href="/app/">${label}</a>`

export const PAGES = [
  {
    path: '/', lang: 'pt-PT', alternate: { en: '/en/' }, nav: 'home',
    title: 'Série · Plano de treino com demonstração de cada exercício',
    description: 'O plano que o teu PT te passou, com animação, músculos e passos de cada exercício, registo de séries e progressão automática. Os teus dados ficam contigo.',
    body: `
<section class="hero"><div class="wrap">
  <p class="eyebrow">Plano de treino · PT e aluno</p>
  <h1>O teu plano.<br><span class="acc">Cada série.</span></h1>
  <p class="lead">O plano que o teu personal trainer te passou, com a demonstração de cada exercício, os músculos que trabalha e como o fazer bem. Registas cada série e a app diz-te quando subir o peso.</p>
  <div class="actions">${appCta()}<a class="btn ghost" href="/sobre/">Como funciona</a></div>
</div></section>

<section class="band" aria-labelledby="f-h"><div class="wrap">
  <p class="eyebrow">O que tens</p>
  <h2 id="f-h">Tudo o que precisas no ginásio</h2>
  <div class="grid">
    <div class="cell"><span class="num">01</span><h3>Cada exercício explicado</h3><p>Mais de 5 600 exercícios com animação, músculos principais e secundários num mapa do corpo, e os passos de execução.</p></div>
    <div class="cell"><span class="num">02</span><h3>Registo série a série</h3><p>Os pesos da última vez já preenchidos, temporizador de descanso entre séries e recordes detetados enquanto treinas.</p></div>
    <div class="cell"><span class="num">03</span><h3>Progressão automática</h3><p>Progressão linear, dupla ou tripla. Chegas ao topo do intervalo de repetições em todas as séries e o peso sobe.</p></div>
    <div class="cell"><span class="num">04</span><h3>Supersets e aquecimentos</h3><p>Pares e circuitos com descanso por ronda, aquecimentos calculados pela carga e cardio por tempo.</p></div>
    <div class="cell"><span class="num">05</span><h3>O teu PT na app</h3><p>O teu personal trainer envia-te o plano. Abres, aceitas e aparece no teu horário semanal.</p></div>
    <div class="cell"><span class="num">06</span><h3>Funciona offline</h3><p>Instala-se no ecrã do telemóvel e continua a funcionar sem rede no ginásio. Sincroniza quando voltas a ter ligação.</p></div>
  </div>
</div></section>

<section class="band" aria-labelledby="pt-h"><div class="wrap split">
  <div>
    <p class="eyebrow">Para personal trainers</p>
    <h2 id="pt-h">Os teus alunos, os teus planos</h2>
    <p class="lead">Convidas cada aluno com um código. Montas o plano uma vez e envias-o a quem quiseres. Vês quem treinou e quando.</p>
    <div class="actions mt-24"><a class="btn ghost" href="/personal-trainers/">Saber mais</a></div>
  </div>
  <ol class="steps">
    <li><div><strong>Convida</strong><span>Geras um código. Quem cria conta com ele fica teu aluno.</span></div></li>
    <li><div><strong>Monta o plano</strong><span>Rotinas, supersets, intervalos de repetições e regras de progressão.</span></div></li>
    <li><div><strong>Envia</strong><span>O aluno recebe o plano na página inicial e aceita-o com um toque.</span></div></li>
  </ol>
</div></section>

<section class="band" aria-labelledby="priv-h"><div class="wrap">
  <p class="eyebrow">Segurança</p>
  <h2 id="priv-h">Sem medo de usar</h2>
  <div class="facts">
    <div class="fact"><b>Passkeys</b><span>Entras com a impressão digital ou o rosto. A password é opcional.</span></div>
    <div class="fact"><b>Sem anúncios</b><span>Nem rastreadores, nem venda de dados. Nada é enviado a terceiros.</span></div>
    <div class="fact"><b>Código aberto</b><span>Baseado no openGym, AGPL-3.0. Qualquer pessoa pode ver como funciona.</span></div>
  </div>
  <p class="mt-24"><a href="/privacidade/">Lê a política de privacidade</a></p>
</div></section>`
  },
  {
    path: '/sobre/', lang: 'pt-PT', nav: 'sobre', crumbs: [['Início', '/'], ['Sobre o projeto', '/sobre/']],
    title: 'Sobre o projeto · Série',
    description: 'O que é a Série, de onde vem, como funciona entre personal trainer e aluno, e como guarda os teus dados.',
    body: `
<div class="wrap">
  <article class="prose page">
    <p class="eyebrow">Sobre o projeto</p>
    <h1>Porque existe a Série</h1>
    <p class="lead">Começou com um plano de treino numa app de ginásio: uma lista de exercícios, séries e repetições, sem mostrar como se faz cada um, que músculo trabalha ou quando subir o peso. A Série junta esse plano a tudo o resto.</p>

    <h2>De onde vem</h2>
    <p>A Série é um fork do <a href="https://github.com/DuarteSantos8/openGym" rel="noopener">openGym</a>, uma app de treino open source criada por Duarte Santos. O openGym já trazia o essencial: uma biblioteca de mais de 5 600 exercícios com animações, mapas musculares, registo de treinos, progressão automática, sincronização entre dispositivos e funcionamento offline.</p>
    <p>Por cima disso, a Série acrescenta o papel de <strong>personal trainer</strong>, uma identidade visual própria e a forma de ser publicada na web.</p>

    <h2>Como funciona</h2>
    <ol class="steps">
      <li><div><strong>O PT convida</strong><span>Gera um código de convite. O aluno cria conta com esse código e fica ligado ao PT.</span></div></li>
      <li><div><strong>O PT monta o plano</strong><span>No seu próprio ecrã de Plano: rotinas, dias da semana, supersets, intervalos de repetições e a regra de progressão.</span></div></li>
      <li><div><strong>O aluno recebe</strong><span>O plano aparece na página inicial do aluno. Ao aceitar, entra no horário semanal sem apagar nada do que já tinha.</span></div></li>
      <li><div><strong>O aluno treina</strong><span>Abre o treino do dia, vê a demonstração de cada exercício, regista cada série e a app ajusta o peso da próxima vez.</span></div></li>
    </ol>

    <h2>Os teus dados</h2>
    <p>Cada conta guarda o seu plano, treinos e peso corporal no servidor da Série, e uma cópia no teu dispositivo para funcionar sem rede. Não há anúncios, rastreadores nem partilha com terceiros. O acesso é feito com passkey (impressão digital, rosto ou PIN) ou com password.</p>

    <h2>Licenças</h2>
    <ul>
      <li>O código é AGPL-3.0, como o openGym. O código-fonte da Série está em <a href="${SITE.repo}" rel="noopener">GitHub</a>.</li>
      <li>As animações e imagens dos exercícios são da <a href="https://gymvisual.com/" rel="noopener">Gym visual</a> e estão licenciadas ao openGym, com as condições do aviso do projeto. Não estão abrangidas pela AGPL.</li>
    </ul>
    <div class="actions mt-32">${appCta()}<a class="btn ghost" href="/personal-trainers/">Para personal trainers</a></div>
  </article>
</div>`
  },
  {
    path: '/personal-trainers/', lang: 'pt-PT', nav: 'pt', crumbs: [['Início', '/'], ['Personal trainers', '/personal-trainers/']],
    title: 'Para personal trainers · Série',
    description: 'Convida alunos com um código, envia-lhes planos de treino e acompanha quem treinou. Os alunos veem cada exercício explicado.',
    body: `
<div class="wrap">
  <article class="prose page">
    <p class="eyebrow">Para personal trainers</p>
    <h1>Os teus alunos numa só app</h1>
    <p class="lead">Montas o plano com as ferramentas completas de planeamento e envias-o ao aluno. Ele vê cada exercício com animação e passos, e regista cada série.</p>
    <h2>O que podes fazer</h2>
    <ul>
      <li><strong>Convidar alunos</strong> com um código único. Quem cria conta com ele fica ligado a ti.</li>
      <li><strong>Enviar o plano semanal ou um programa</strong> com várias semanas. O aluno aceita e mantém tudo o que já tinha.</li>
      <li><strong>Ver quem treina</strong>: número de treinos e o último de cada aluno.</li>
      <li><strong>Prescrever com detalhe</strong>: supersets com descanso por ronda, intervalos de repetições, progressão linear, dupla ou tripla, aquecimentos, cardio por tempo e notas por exercício.</li>
    </ul>
    <h2>Como começar</h2>
    <p>A conta de PT é ativada pelo administrador. Fala connosco para teres acesso.</p>
    <div class="mt-32">${appCta('Abrir a app')}</div>
  </article>
</div>`
  },
  {
    path: '/privacidade/', lang: 'pt-PT', nav: 'priv', crumbs: [['Início', '/'], ['Privacidade', '/privacidade/']],
    title: 'Política de privacidade · Série',
    description: 'Que dados a Série guarda, onde ficam, quem os vê e como os apagas.',
    body: `
<div class="wrap">
  <article class="prose page">
    <p class="eyebrow">Privacidade</p>
    <h1>Política de privacidade</h1>
    <p class="lead">Guardamos só o que a app precisa para funcionar e nada é vendido ou partilhado.</p>
    <h2>Que dados guardamos</h2>
    <ul>
      <li>O nome do perfil e, se o adicionares, o e-mail.</li>
      <li>O plano, os treinos, as pesagens e as medidas que registares.</li>
      <li>As passkeys (só a parte pública) ou o hash da password. Nunca a password em si.</li>
      <li>Um registo de atividade de segurança (inícios de sessão e tentativas falhadas), com o endereço IP encurtado.</li>
    </ul>
    <h2>Quem os vê</h2>
    <p>Tu. O teu personal trainer vê o teu nome, quantos treinos fizeste e a data do último. O administrador do serviço vê a lista de contas para gerir acessos.</p>
    <h2>Cookies</h2>
    <p>Um único cookie de sessão, necessário para manter a sessão iniciada. Não há cookies de publicidade nem de estatísticas.</p>
    <h2>Apagar a conta</h2>
    <p>Em Definições, Conta, podes exportar os teus dados e apagar a conta. Apagar remove o perfil, os treinos e as fotos de forma definitiva.</p>
    <h2>Responsável</h2>
    <p>[NOME DO RESPONSÁVEL] · [E-MAIL DE CONTACTO]</p>
  </article>
</div>`
  },
  {
    path: '/en/', lang: 'en', alternate: { 'pt-PT': '/' }, nav: 'home',
    title: 'Série · Workout plans with every exercise demonstrated',
    description: 'The plan your personal trainer gave you, with an animation, the muscles and the steps for every exercise, set-by-set logging and automatic progression.',
    body: `
<section class="hero"><div class="wrap">
  <p class="eyebrow">Workout plans · trainer and student</p>
  <h1>Your plan.<br><span class="acc">Every set.</span></h1>
  <p class="lead">The plan your personal trainer gave you, with a demonstration of every exercise, the muscles it works and how to do it well. Log every set and the app tells you when to add weight.</p>
  <div class="actions"><a class="btn primary" href="/app/">Open the app</a><a class="btn ghost" href="/sobre/" hreflang="pt-PT">About the project (PT)</a></div>
</div></section>
<section class="band" aria-labelledby="f-h-en"><div class="wrap">
  <h2 id="f-h-en">What you get</h2>
  <div class="grid">
    <div class="cell"><span class="num">01</span><h3>Every exercise explained</h3><p>Over 5,600 exercises with an animation, primary and secondary muscles on a body map, and step-by-step instructions.</p></div>
    <div class="cell"><span class="num">02</span><h3>Set-by-set logging</h3><p>Last time's weights filled in, a rest timer between sets and records spotted as you train.</p></div>
    <div class="cell"><span class="num">03</span><h3>Your trainer in the app</h3><p>Your trainer sends you the plan. Open it, accept it, and it is on your weekly schedule.</p></div>
  </div>
</div></section>`
  }
]

export const NOT_FOUND = {
  path: '/404.html', lang: 'pt-PT', noindex: true,
  title: 'Página não encontrada · Série',
  description: 'Esta página não existe.',
  body: `
<section class="hero"><div class="wrap">
  <p class="eyebrow">Erro 404</p>
  <h1>Esta série<br><span class="acc">não existe.</span></h1>
  <p class="lead">A página que procuras mudou de sítio ou nunca existiu.</p>
  <nav class="actions" aria-label="Para onde ir">
    <a class="btn primary" href="/">Página inicial</a>
    <a class="btn ghost" href="/app/">Abrir a app</a>
    <a class="btn ghost" href="/sobre/">Sobre o projeto</a>
  </nav>
</div></section>`
}
