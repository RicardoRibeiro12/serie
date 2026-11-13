# Série

A app de treino do ginásio, para sócios, personal trainers e donos. Gratuita.

- **Sócios:** o plano do PT no telemóvel, cada série registada com a demonstração do exercício, o
  resumo no fim do treino, o temporizador de descanso com o próximo exercício, o cartão de sócio com
  QR e a reserva de aulas.
- **Personal trainers:** planos à medida de cada aluno, avaliações completas (com consentimento,
  RGPD), o progresso de cada um e exercícios partilhados com os outros PTs do ginásio.
- **Donos:** o modo receção que lê os QR à porta, o horário de aulas com vagas, quem marca e falta,
  o painel com o movimento do ginásio e a gestão de sócios, PTs e cartões.

App: https://serie-treino.netlify.app/app/

## Como está feito

- `frontend/`: a app (React + Vite), instalável no telemóvel como PWA.
- `supabase/`: a base de dados e as regras de acesso (Postgres com RLS). Correr `schema.sql`,
  `app.sql`, `classes.sql` e `reset.sql` no SQL Editor do Supabase.
- `landing/` e `scripts/build-site.mjs`: o site público, publicado com a app no Netlify.
- `api/`: o servidor local, para desenvolvimento e testes.
- `catalogue/`: os 6.554 exercícios (nomes, músculos e instruções em várias línguas) e as imagens.

```bash
cd frontend && npm install && npm run dev      # a app, em http://localhost:5174
cd api && npm install && node server.js        # o servidor local, na porta 3000
cd frontend && npx vitest run                  # os testes da app
```

## Origem e licenças

A Série começou como uma cópia do [openGym](https://github.com/DuarteSantos8/openGym), com licença
AGPL-3.0-or-later, que a Série mantém (`LICENSE`): o código continua público. Os textos dos exercícios
vêm do openGym (AGPL) e do ExerciseDB (MIT). As imagens e animações dos exercícios são da Gym visual e
têm uma licença própria, só para uso não comercial: ver `NOTICE.md`.
