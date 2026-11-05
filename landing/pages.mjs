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

// The home page, in both languages. It is built around the one thing every student and trainer
// already knows: the written prescription (exercise, sets × reps, rest). The plan card in the hero,
// the four steps it travels and the progression example are fragments of the app's own screens,
// set in HTML with the app's own words. Their values are examples and say so.
const ARROW = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 34L34 14M18 14h16v16" stroke="currentColor" stroke-width="4" stroke-linecap="square" fill="none"/></svg>'
const HOME = {
  pt: {
    h1: ['O teu plano.', 'Cada série.'],
    lead: 'O plano que o teu PT te passou, com cada exercício demonstrado: os músculos que trabalha e como o fazer bem. Registas cada série e a app diz-te quando subir o peso.',
    cta: 'Entrar na app', more: 'Como o plano chega até ti',
    card: { label: 'Exemplo de um dia de plano', cap: 'Exemplo', day: 'Segunda · Peito e costas', from: 'Do teu PT', foot: 'Progressão dupla · aquecimento pela carga',
      rows: [['Supino com barra', '3 × 8–12', '90 s'], ['Remada com barra', '3 × 8–12', '90 s'], ['Supersérie: aberturas + face pull', '3 × 12–15', '60 s'], ['Prancha', '3 × 45 s', '45 s']] },
    tripH: 'Como o plano chega até ti',
    trip: [
      ['Primeiro, o convite.', 'O PT gera um código. Crias conta com ele e ficas ligado ao teu PT.', 'invite'],
      ['Depois, o plano.', 'O PT monta as rotinas no ecrã de Plano: dias, supersets, intervalos de repetições e a regra de progressão.', 'week'],
      ['A seguir, chega-te.', 'Aparece na tua página inicial. Abres, aceitas e entra no horário semanal sem apagar o que já tinhas.', 'offer'],
      ['No ginásio, cada série.', 'Vês a demonstração, registas o peso e as repetições, e o descanso conta sozinho.', 'sets']
    ],
    frag: { invite: ['Convidar um aluno', 'Novo código'], week: [['Seg', 'Peito e costas'], ['Qua', 'Pernas'], ['Sex', 'Ombros e braços']],
      offer: ['Do teu PT', 'Plano novo: Força, 8 semanas', 'Abrir plano', 'Descartar'], sets: ['Supino com barra', 'Descanso'] },
    ptLine: 'És personal trainer?', ptLink: 'Vê o que podes fazer com os teus alunos',
    progH: 'Quando sobe o peso',
    prog: 'Na progressão dupla trabalhas dentro de um intervalo de repetições com o mesmo peso. Quando chegas ao topo em todas as séries, o peso sobe e as repetições voltam ao fundo. Também há progressão linear e tripla.',
    progNote: 'Exemplo com 3 × 8–12 e subidas de 2,5 kg. Escolhe um treino.',
    progLegend: 'Treino', progEx: 'Supino com barra',
    sessions: [['60', '10 · 9 · 8', 'Ainda não. Fica nos 60 kg.'], ['60', '12 · 11 · 10', 'Quase. Fica nos 60 kg.'], ['60', '12 · 12 · 12', 'Topo em todas as séries. Próximo treino: 62,5 kg.'], ['62,5', '8 · 8 · 8', 'Peso novo, repetições de volta ao fundo.']],
    listH: 'Feito para o ginásio',
    list: [
      ['Cada exercício explicado', 'Mais de 5 600 exercícios com animação, músculos principais e secundários num mapa do corpo, e os passos de execução.'],
      ['Os pesos da última vez', 'Já preenchidos quando abres o treino, com temporizador de descanso entre séries e recordes detetados enquanto treinas.'],
      ['Supersets e aquecimentos', 'Pares e circuitos com descanso por ronda, aquecimentos calculados pela carga e cardio por tempo.'],
      ['Funciona sem rede', 'Instala-se no ecrã do telemóvel e continua a funcionar offline. Sincroniza quando voltas a ter ligação.']
    ],
    dataH: 'Os teus dados, sem letra pequena',
    data: [['Sem anúncios, nada vendido.', 'Sem rastreadores e nada é enviado a terceiros. O único cookie é o da sessão.'], ['Passkeys', 'Entras com a impressão digital ou o rosto. A palavra-passe é opcional.'], ['Código aberto', 'Fork do openGym, AGPL-3.0. Qualquer pessoa pode ver como funciona.']],
    dataLink: 'Lê a política de privacidade', dataHref: '/privacidade/',
    bandLine: 'Abre a app, instala-a no ecrã do telemóvel e leva o plano para o ginásio.', bandWord: 'Entrar'
  },
  en: {
    h1: ['Your plan.', 'Every set.'],
    lead: 'The plan your trainer gave you, with every exercise demonstrated: the muscles it works and how to do it well. Log every set and the app tells you when to add weight.',
    cta: 'Open the app', more: 'How the plan reaches you',
    card: { label: 'Example of one day of a plan', cap: 'Example', day: 'Monday · Chest and back', from: 'From your trainer', foot: 'Double progression · warm-ups by load',
      rows: [['Barbell bench press', '3 × 8–12', '90 s'], ['Barbell row', '3 × 8–12', '90 s'], ['Superset: flyes + face pull', '3 × 12–15', '60 s'], ['Plank', '3 × 45 s', '45 s']] },
    tripH: 'How the plan reaches you',
    trip: [
      ['First, the invite.', 'Your trainer makes a code. Sign up with it and you are linked to your trainer.', 'invite'],
      ['Then, the plan.', 'Your trainer builds the routines in the Plan screen: days, supersets, rep ranges and the progression rule.', 'week'],
      ['Next, it lands.', 'It shows up on your home screen. Open it, accept it, and it joins your week without erasing what you had.', 'offer'],
      ['At the gym, every set.', 'Watch the demonstration, log the weight and reps, and the rest timer runs on its own.', 'sets']
    ],
    frag: { invite: ['Invite a student', 'New code'], week: [['Mon', 'Chest and back'], ['Wed', 'Legs'], ['Fri', 'Shoulders and arms']],
      offer: ['From your trainer', 'New plan: Strength, 8 weeks', 'Open plan', 'Dismiss'], sets: ['Barbell bench press', 'Rest'] },
    ptLine: 'Are you a personal trainer?', ptLink: 'See what you can do with your students (PT)',
    progH: 'When the weight goes up',
    prog: 'With double progression you work through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom. Linear and triple progression are there too.',
    progNote: 'Example with 3 × 8–12 and 2.5 kg steps. Pick a session.',
    progLegend: 'Session', progEx: 'Barbell bench press',
    sessions: [['60', '10 · 9 · 8', 'Not yet. Stay at 60 kg.'], ['60', '12 · 11 · 10', 'Close. Stay at 60 kg.'], ['60', '12 · 12 · 12', 'Top of the range in every set. Next session: 62.5 kg.'], ['62.5', '8 · 8 · 8', 'New weight, reps back to the bottom.']],
    listH: 'Made for the gym floor',
    list: [
      ['Every exercise explained', 'Over 5,600 exercises with an animation, primary and secondary muscles on a body map, and step-by-step instructions.'],
      ['Last time’s weights', 'Already filled in when you open the workout, with a rest timer between sets and records spotted as you train.'],
      ['Supersets and warm-ups', 'Pairs and circuits with rest per round, warm-ups worked out from the load, and timed cardio.'],
      ['Works without signal', 'Installs on your phone’s home screen and keeps working offline. It syncs when you are back online.']
    ],
    dataH: 'Your data, no small print',
    data: [['No ads, nothing sold.', 'No trackers, and nothing is sent to third parties. The only cookie is the session one.'], ['Passkeys', 'Sign in with your fingerprint or face. A password is optional.'], ['Open source', 'A fork of openGym, AGPL-3.0. Anyone can see how it works.']],
    dataLink: 'Read the privacy policy (PT)', dataHref: '/privacidade/',
    bandLine: 'Open the app, add it to your phone’s home screen and take the plan to the gym.', bandWord: 'Start'
  },
  fr: {
    h1: ['Ton plan.', 'Chaque série.'],
    lead: 'Le plan que ton coach t’a donné, avec chaque exercice démontré : les muscles sollicités et comment bien l’exécuter. Tu notes chaque série et l’appli te dit quand augmenter la charge.',
    cta: 'Ouvrir l’appli', more: 'Comment le plan arrive jusqu’à toi',
    card: { label: 'Exemple d’une journée de plan', cap: 'Exemple', day: 'Lundi · Pectoraux et dos', from: 'De ton coach', foot: 'Progression double · échauffement selon la charge',
      rows: [['Développé couché barre', '3 × 8–12', '90 s'], ['Rowing barre', '3 × 8–12', '90 s'], ['Superset : écartés + face pull', '3 × 12–15', '60 s'], ['Gainage', '3 × 45 s', '45 s']] },
    tripH: 'Comment le plan arrive jusqu’à toi',
    trip: [
      ['D’abord, l’invitation.', 'Ton coach génère un code. Tu crées ton compte avec et tu es relié à ton coach.', 'invite'],
      ['Ensuite, le plan.', 'Ton coach construit les séances dans l’écran Plan : jours, supersets, fourchettes de répétitions et règle de progression.', 'week'],
      ['Puis, il arrive.', 'Il apparaît sur ton écran d’accueil. Tu l’ouvres, tu l’acceptes et il rejoint ta semaine sans effacer ce que tu avais.', 'offer'],
      ['À la salle, chaque série.', 'Tu regardes la démonstration, tu notes la charge et les répétitions, et le repos se décompte tout seul.', 'sets']
    ],
    frag: { invite: ['Inviter un élève', 'Nouveau code'], week: [['Lun', 'Pectoraux et dos'], ['Mer', 'Jambes'], ['Ven', 'Épaules et bras']],
      offer: ['De ton coach', 'Nouveau plan : Force, 8 semaines', 'Ouvrir le plan', 'Ignorer'], sets: ['Développé couché barre', 'Repos'] },
    ptLine: 'Tu es coach ?', ptLink: 'Ce que tu peux faire avec tes élèves (PT)',
    progH: 'Quand la charge augmente',
    prog: 'Avec la progression double, tu travailles dans une fourchette de répétitions à charge constante. Quand tu atteins le haut de la fourchette sur toutes les séries, la charge augmente et les répétitions repartent du bas. Les progressions linéaire et triple sont là aussi.',
    progNote: 'Exemple en 3 × 8–12 avec des paliers de 2,5 kg. Choisis une séance.',
    progLegend: 'Séance', progEx: 'Développé couché barre',
    sessions: [['60', '10 · 9 · 8', 'Pas encore. Reste à 60 kg.'], ['60', '12 · 11 · 10', 'Presque. Reste à 60 kg.'], ['60', '12 · 12 · 12', 'Haut de la fourchette sur toutes les séries. Prochaine séance : 62,5 kg.'], ['62,5', '8 · 8 · 8', 'Nouvelle charge, répétitions de retour en bas.']],
    listH: 'Pensé pour la salle',
    list: [
      ['Chaque exercice expliqué', 'Plus de 5 600 exercices avec animation, muscles principaux et secondaires sur une carte du corps, et les étapes d’exécution.'],
      ['Les charges de la dernière fois', 'Déjà remplies quand tu ouvres la séance, avec un minuteur de repos entre les séries et les records repérés pendant que tu t’entraînes.'],
      ['Supersets et échauffements', 'Paires et circuits avec repos par tour, échauffements calculés selon la charge et cardio au temps.'],
      ['Marche sans réseau', 'S’installe sur l’écran d’accueil du téléphone et continue de marcher hors ligne. Se synchronise dès que tu retrouves du réseau.']
    ],
    dataH: 'Tes données, sans petites lignes',
    data: [['Pas de pub, rien de vendu.', 'Pas de traceurs, et rien n’est envoyé à des tiers. Le seul cookie est celui de la session.'], ['Passkeys', 'Tu te connectes avec ton empreinte ou ton visage. Le mot de passe est facultatif.'], ['Code ouvert', 'Fork d’openGym, AGPL-3.0. Tout le monde peut voir comment ça marche.']],
    dataLink: 'Lire la politique de confidentialité (PT)', dataHref: '/privacidade/',
    bandLine: 'Ouvre l’appli, installe-la sur l’écran d’accueil et emporte ton plan à la salle.', bandWord: 'Entrer'
  }
}

function frag(kind, c) {
  const f = c.frag
  if (kind === 'invite') return `<div class="ui ui-invite" data-ui aria-hidden="true"><b>${f.invite[0]}</b><span class="ui-btn">+ ${f.invite[1]}</span></div>`
  if (kind === 'week') return `<div class="ui ui-week" data-ui aria-hidden="true">${f.week.map(([d, n]) => `<div><span class="fig">${d}</span>${n}</div>`).join('')}</div>`
  if (kind === 'offer') return `<div class="ui ui-offer" data-ui aria-hidden="true"><small>${f.offer[0]}</small><b>${f.offer[1]}</b><div class="ui-row"><span class="ui-btn ui-fill">${f.offer[2]}</span><span class="ui-btn">${f.offer[3]}</span></div></div>`
  return `<div class="ui ui-sets" data-ui aria-hidden="true"><b>${f.sets[0]}</b>${['12', '11', '10'].map((r, i) => `<div><span class="fig">${i + 1}</span><span class="fig">60 kg × ${r}</span></div>`).join('')}<div class="ui-rest"><span>${f.sets[1]}</span><span class="fig">1:30</span></div></div>`
}

function home(k) {
  const c = HOME[k], id = s => s + (k === 'pt' ? '' : '-' + k)
  return `
<section class="poster"><div class="wrap poster-grid">
  <div class="poster-copy">
    <h1><span class="line"><span>${c.h1[0]}</span></span><span class="line"><span>${c.h1[1]}</span></span></h1>
    <p class="poster-lead">${c.lead}</p>
    <div class="actions"><a class="btn ink" href="/app/">${c.cta}</a><a class="textlink" href="#${id('viagem')}">${c.more}</a></div>
  </div>
  <figure class="plan" aria-label="${c.card.label}">
    <div class="plan-card" data-ui>
      <div class="plan-top"><span>${c.card.from}</span><span class="plan-tag">${c.card.cap}</span></div>
      <p class="plan-day">${c.card.day}</p>
      <ul>${c.card.rows.map(([n, p, r]) => `<li><span class="plan-ex">${n}</span><span class="fig">${p}</span><span class="fig plan-rest">${r}</span></li>`).join('')}</ul>
      <p class="plan-foot">${c.card.foot}</p>
    </div>
  </figure>
</div></section>

<section class="trip" id="${id('viagem')}" aria-labelledby="${id('trip-h')}">
  <h2 id="${id('trip-h')}" class="wrap">${c.tripH}</h2>
  <ol class="trip-fields">
    ${c.trip.map(([t, p, kind]) => `<li><div class="trip-say"><h3>${t}</h3><p>${p}</p></div>${frag(kind, c)}</li>`).join('\n    ')}
  </ol>
  <p class="wrap trip-pt">${c.ptLine} <a href="/personal-trainers/"${k !== 'pt' ? ' hreflang="pt-PT"' : ''}>${c.ptLink}</a></p>
</section>

<section class="prog" aria-labelledby="${id('prog-h')}"><div class="wrap prog-grid">
  <div>
    <h2 id="${id('prog-h')}">${c.progH}</h2>
    <p class="prog-copy">${c.prog}</p>
    <p class="prog-note">${c.progNote}</p>
  </div>
  <fieldset class="prog-ui" data-ui>
    <legend>${c.progEx}</legend>
    ${c.sessions.map((_, i) => `<input type="radio" name="${id('s')}" id="${id('s' + (i + 1))}" class="s${i + 1}"${i === 0 ? ' checked' : ''}><label for="${id('s' + (i + 1))}">${c.progLegend} ${i + 1}</label>`).join('')}
    <div class="prog-panels">
      ${c.sessions.map(([w, reps, say], i) => `<div class="prog-p p${i + 1}"><p class="prog-w"><span class="fig">${w}</span> kg <span class="fig prog-scheme">3 × 8–12</span></p><p class="prog-reps fig">${reps}</p><p class="prog-say">${say}</p></div>`).join('\n      ')}
    </div>
  </fieldset>
</div></section>

<section class="list" aria-labelledby="${id('list-h')}"><div class="wrap">
  <h2 id="${id('list-h')}">${c.listH}</h2>
  <ul class="big-list">
    ${c.list.map(([h, p]) => `<li><h3>${h}</h3><p>${p}</p></li>`).join('\n    ')}
  </ul>
</div></section>

<section class="data" aria-labelledby="${id('data-h')}"><div class="wrap">
  <h2 id="${id('data-h')}">${c.dataH}</h2>
  <div class="data-panels">
    ${c.data.map(([h, p], i) => `<div class="dp dp${i + 1}"><p class="dp-h">${h}</p><p>${p}</p></div>`).join('\n    ')}
  </div>
  <p class="data-link"><a href="${c.dataHref}"${k !== 'pt' ? ' hreflang="pt-PT"' : ''}>${c.dataLink}</a></p>
</div></section>

<a class="band-link" href="/app/"><span class="wrap band-inner"><span class="band-line">${c.bandLine}</span>${ARROW}<span class="band-word">${c.bandWord}</span></span></a>`
}

export const PAGES = [
  {
    path: '/', lang: 'pt-PT', alternate: { en: '/en/', fr: '/fr/' }, nav: 'home',
    title: 'Série · Plano de treino com demonstração de cada exercício',
    description: 'O plano que o teu PT te passou, com animação, músculos e passos de cada exercício, registo de séries e progressão automática. Os teus dados ficam contigo.',
    body: home('pt')
  },
  {
    path: '/sobre/', lang: 'pt-PT', nav: 'sobre', crumbs: [['Início', '/'], ['Sobre o projeto', '/sobre/']],
    title: 'Sobre o projeto · Série',
    description: 'O que é a Série, de onde vem, como funciona entre personal trainer e aluno, e como guarda os teus dados.',
    body: `
<div class="wrap">
  <article class="prose page">
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
    description: 'Que dados a Série guarda, porquê, onde ficam, quem os vê, o consentimento para dados de saúde e como os apagas.',
    body: `
<div class="wrap">
  <article class="prose page">
    <h1>Política de privacidade</h1>
    <p class="lead">Guardamos o que a app precisa para funcionar. Nada é vendido nem usado para publicidade. Versão de novembro de 2026.</p>
    <h2>Que dados guardamos</h2>
    <ul>
      <li><strong>Conta:</strong> o nome do perfil e, se o adicionares, o e-mail. A palavra-passe é guardada só como hash pelo serviço de autenticação; nunca a vemos.</li>
      <li><strong>Treino:</strong> o plano, os treinos, as pesagens e as medidas que registares.</li>
      <li><strong>Ginásio:</strong> o ginásio a que pertences, o teu papel (aluno, PT ou dono), o teu PT, o cartão de sócio e as entradas e saídas lidas na receção.</li>
      <li><strong>Avaliações (dados de saúde):</strong> só se autorizares, as avaliações que o teu PT regista: peso, composição corporal (gordura, massa muscular, água, gordura visceral), metabolismo e frequência cardíaca.</li>
    </ul>
    <h2>Porquê e com que fundamento</h2>
    <ul>
      <li>A conta, os treinos e o cartão são necessários para te prestar o serviço que pedes ao criar a conta.</li>
      <li>As avaliações são dados de saúde, uma categoria especial do RGPD (artigo 9.º). Só são registadas com o teu <strong>consentimento explícito</strong>, dado à parte e que podes retirar a qualquer momento. Sem ele, a app não deixa o PT gravar nenhuma avaliação tua.</li>
    </ul>
    <h2>Quem os vê</h2>
    <ul>
      <li><strong>Tu</strong> vês tudo o que é teu.</li>
      <li><strong>O teu PT</strong> vê o teu progresso de treino, os planos que te escreveu e, se autorizaste, as tuas avaliações.</li>
      <li><strong>O dono do teu ginásio</strong> vê a lista de sócios, os cartões e as entradas e saídas, e pode ver o treino e as avaliações dos sócios do seu ginásio, para acompanhar o trabalho dos PTs.</li>
      <li>Outros ginásios <strong>não</strong> veem nada teu. Esta separação é imposta pelas regras da própria base de dados.</li>
    </ul>
    <h2>Onde ficam</h2>
    <p>Numa base de dados do Supabase, numa região europeia. O site e a app são servidos pelo Netlify. Não partilhamos os teus dados com mais ninguém.</p>
    <h2>Durante quanto tempo</h2>
    <p>Enquanto a tua conta existir. Quando a apagas, os teus dados são apagados com ela.</p>
    <h2>Os teus direitos</h2>
    <ul>
      <li><strong>Acesso e portabilidade:</strong> em Definições, Conta, podes exportar os teus dados.</li>
      <li><strong>Retirar o consentimento e apagar as avaliações:</strong> em Definições, Conta, Privacidade e dados de saúde.</li>
      <li><strong>Apagamento:</strong> em Definições, Conta, podes apagar a conta e tudo o que é teu. Um dono passa primeiro o ginásio a outra pessoa.</li>
      <li><strong>Retificação:</strong> corriges os teus dados na própria app, ou pedes ao teu PT ou ao responsável.</li>
      <li>Podes apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD).</li>
    </ul>
    <h2>Cookies</h2>
    <p>Não usamos cookies de publicidade nem de estatísticas. A app guarda a tua sessão e os teus dados de treino no armazenamento local do browser, para funcionar também sem rede.</p>
    <h2>Responsável</h2>
    <p>[NOME DO RESPONSÁVEL] · [E-MAIL DE CONTACTO]</p>
  </article>
</div>`
  },
  {
    path: '/en/', lang: 'en', alternate: { 'pt-PT': '/', fr: '/fr/' }, nav: 'home',
    title: 'Série · Workout plans with every exercise demonstrated',
    description: 'The plan your personal trainer gave you, with an animation, the muscles and the steps for every exercise, set-by-set logging and automatic progression.',
    body: home('en')
  },
  {
    path: '/fr/', lang: 'fr', alternate: { 'pt-PT': '/', en: '/en/' }, nav: 'home',
    title: 'Série · Plans d’entraînement avec chaque exercice démontré',
    description: 'Le plan que ton coach t’a donné, avec l’animation, les muscles et les étapes de chaque exercice, le suivi série par série et la progression automatique.',
    body: home('fr')
  }
]

export const NOT_FOUND = {
  path: '/404.html', lang: 'pt-PT', noindex: true,
  title: 'Página não encontrada · Série',
  description: 'Esta página não existe.',
  body: `
<section class="poster poster-short"><div class="wrap">
  <h1><span class="line"><span>Esta série</span></span><span class="line"><span>não existe.</span></span></h1>
  <p class="poster-lead">A página que procuras mudou de sítio ou nunca existiu.</p>
  <nav class="actions" aria-label="Para onde ir">
    <a class="btn ink" href="/">Página inicial</a>
    <a class="textlink" href="/app/">Abrir a app</a>
    <a class="textlink" href="/sobre/">Sobre o projeto</a>
  </nav>
</div></section>`
}
