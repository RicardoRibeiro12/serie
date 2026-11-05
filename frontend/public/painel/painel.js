// The gym's dashboard, for a desk computer: entries and exits, who is in now, busy hours, members
// and their cards. Plain JS on the app's admin API (api/members.js, /api/admin/users) with the same
// session cookie as the app, so it needs no login of its own. No dependencies, no inline script.
(function () {
  'use strict'
  var $ = function (id) { return document.getElementById(id) }
  var API = '../api'
  // pt, en or fr: the app's own choice if this browser has one, else the browser's language.
  var lang = (function () {
    try { var s = JSON.parse(localStorage.getItem('gym_state_v1') || '{}'); if (s && s.lang) return String(s.lang).slice(0, 2) } catch (e) {}
    return (navigator.language || 'pt').slice(0, 2)
  })()
  if (['pt', 'en', 'fr'].indexOf(lang) < 0) lang = 'en'
  document.documentElement.lang = lang === 'pt' ? 'pt-PT' : lang
  var EN = {}, FR = {
    'Dashboard': 'Tableau de bord', 'Period': 'Période', 'Last 7 days': '7 derniers jours', 'Last 14 days': '14 derniers jours', 'Last 30 days': '30 derniers jours', 'Last 90 days': '90 derniers jours',
    'Refresh': 'Actualiser', 'Back to the app': 'Retour à l’app', 'Sign in first': 'Connectez-vous d’abord', 'This dashboard uses your admin session from the app.': 'Ce tableau de bord utilise votre session d’administrateur de l’app.',
    'Open the app': 'Ouvrir l’app', 'In the gym now': 'Dans la salle', 'Entries': 'Entrées', 'Members who came': 'Membres venus', 'Average stay': 'Durée moyenne', 'Users': 'Utilisateurs', 'Active 7 days': 'Actifs 7 jours',
    'Entries per day': 'Entrées par jour', 'Busiest hours': 'Heures d’affluence', 'Front desk: member number or QR text': 'Accueil : numéro de membre ou texte du QR', 'Check in or out': 'Entrée ou sortie',
    'Entries and exits': 'Entrées et sorties', 'Filter by name': 'Filtrer par nom', 'Export CSV': 'Exporter CSV', 'Member': 'Membre', 'Date': 'Date', 'Entry': 'Entrée', 'Exit': 'Sortie', 'Duration': 'Durée', 'How': 'Comment',
    'Members and cards': 'Membres et cartes', 'Card': 'Carte', 'State': 'État', 'Last sync': 'Dernière synchro', 'Nobody right now.': 'Personne pour le moment.', 'No entries in this period.': 'Aucune entrée sur cette période.',
    'app': 'app', 'desk': 'accueil', 'auto': 'auto', 'in the gym': 'dans la salle', 'Active': 'Active', 'Suspended': 'Suspendue', 'No card': 'Pas de carte', 'Issue card': 'Créer la carte', 'Suspend': 'Suspendre', 'Reactivate': 'Réactiver', 'New QR': 'Nouveau QR',
    'checked in': 'est entré', 'checked out': 'est sorti', 'Not an admin on this app.': 'Pas administrateur de cette app.', 'never': 'jamais', 'Make a new QR? The old one stops working.': 'Créer un nouveau QR ? L’ancien ne fonctionnera plus.'
  }, PT = {
    'Dashboard': 'Painel', 'Period': 'Período', 'Last 7 days': 'Últimos 7 dias', 'Last 14 days': 'Últimos 14 dias', 'Last 30 days': 'Últimos 30 dias', 'Last 90 days': 'Últimos 90 dias',
    'Refresh': 'Atualizar', 'Back to the app': 'Voltar à app', 'Sign in first': 'Inicia sessão primeiro', 'This dashboard uses your admin session from the app.': 'Este painel usa a tua sessão de administrador da app.',
    'Open the app': 'Abrir a app', 'In the gym now': 'No ginásio agora', 'Entries': 'Entradas', 'Members who came': 'Sócios que vieram', 'Average stay': 'Tempo médio', 'Users': 'Utilizadores', 'Active 7 days': 'Ativos 7 dias',
    'Entries per day': 'Entradas por dia', 'Busiest hours': 'Horas de maior movimento', 'Front desk: member number or QR text': 'Receção: número de sócio ou texto do QR', 'Check in or out': 'Entrada ou saída',
    'Entries and exits': 'Entradas e saídas', 'Filter by name': 'Filtrar por nome', 'Export CSV': 'Exportar CSV', 'Member': 'Sócio', 'Date': 'Data', 'Entry': 'Entrada', 'Exit': 'Saída', 'Duration': 'Duração', 'How': 'Como',
    'Members and cards': 'Sócios e cartões', 'Card': 'Cartão', 'State': 'Estado', 'Last sync': 'Última sincronização', 'Nobody right now.': 'Ninguém neste momento.', 'No entries in this period.': 'Sem entradas neste período.',
    'app': 'app', 'desk': 'receção', 'auto': 'automático', 'in the gym': 'no ginásio', 'Active': 'Ativo', 'Suspended': 'Suspenso', 'No card': 'Sem cartão', 'Issue card': 'Criar cartão', 'Suspend': 'Suspender', 'Reactivate': 'Reativar', 'New QR': 'QR novo',
    'checked in': 'entrou', 'checked out': 'saiu', 'Not an admin on this app.': 'Não és administrador nesta app.', 'never': 'nunca', 'Make a new QR? The old one stops working.': 'Criar um QR novo? O antigo deixa de funcionar.'
  }
  var DICT = lang === 'pt' ? PT : lang === 'fr' ? FR : EN
  var t = function (s) { return DICT[s] || s }
  var loc = lang === 'pt' ? 'pt-PT' : lang === 'fr' ? 'fr-FR' : 'en-GB'
  var hm = function (iso) { return new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) }
  var dm = function (iso) { return new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short' }) }
  var ms = function (v) { var n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) ? n : 0 }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }

  Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (el) { el.textContent = t(el.getAttribute('data-t')) })
  Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (el) { el.placeholder = t(el.getAttribute('data-tp')) })
  document.title = t('Dashboard') + ' · Série'

  var get = function (path) {
    return fetch(API + path, { credentials: 'include' }).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error(r.status === 403 ? t('Not an admin on this app.') : ''); e.auth = true; throw e }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
  }
  var post = function (path, body) {
    return fetch(API + path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j }) })
  }

  var report = null, members = [], users = []

  function bars(el, data, label) {
    var max = Math.max.apply(null, [1].concat(data.map(function (d) { return d.n })))
    el.setAttribute('aria-label', label)
    el.innerHTML = data.map(function (d) {
      return '<div class="b" title="' + esc(d.title) + ': ' + d.n + '"><span class="n">' + (d.n || '') + '</span><span class="f" style="height:' + (d.n / max * 100) + '%"></span><span class="x">' + esc(d.label) + '</span></div>'
    }).join('')
  }

  function renderVisits() {
    var q = $('filter').value.trim().toLowerCase()
    var rows = (report ? report.visits : []).filter(function (v) { return !q || (v.name || '').toLowerCase().indexOf(q) >= 0 })
    $('visits').tBodies[0].innerHTML = rows.length ? rows.map(function (v) {
      var dur = v.out ? Math.round((Date.parse(v.out) - Date.parse(v.in)) / 60000) : null
      return '<tr><td>' + esc(v.name || '?') + '</td><td>' + dm(v.in) + '</td><td class="num">' + hm(v.in) + '</td><td class="num">' + (v.out ? hm(v.out) : '<span class="pill on">' + t('in the gym') + '</span>') + '</td><td class="num">' + (dur != null ? dur + ' min' : '') + '</td><td>' + t(v.auto ? 'auto' : v.by === 'desk' ? 'desk' : 'app') + '</td></tr>'
    }).join('') : '<tr><td colspan="6" class="dim">' + t('No entries in this period.') + '</td></tr>'
  }

  function renderMembers() {
    var byId = {}
    users.forEach(function (u) { byId[u.id] = u })
    $('members').tBodies[0].innerHTML = members.map(function (m) {
      var u = byId[m.id] || {}
      var c = m.card
      var acts = !c ? '<button data-act="issue" data-id="' + esc(m.id) + '">' + t('Issue card') + '</button>'
        : (c.status === 'active' ? '<button class="ghost" data-act="suspend" data-id="' + esc(m.id) + '">' + t('Suspend') + '</button>' : '<button data-act="activate" data-id="' + esc(m.id) + '">' + t('Reactivate') + '</button>') +
          ' <button class="ghost" data-act="reissue" data-id="' + esc(m.id) + '">' + t('New QR') + '</button>'
      return '<tr><td>' + esc(m.name) + (m.inside ? ' <span class="pill on">' + t('in the gym') + '</span>' : '') + '</td><td class="num">' + (c ? esc(c.number) : '<span class="dim">' + t('No card') + '</span>') + '</td><td>' + (c ? '<span class="pill ' + (c.status === 'active' ? 'ok' : 'bad') + '">' + t(c.status === 'active' ? 'Active' : 'Suspended') + '</span>' : '') + '</td><td>' + (ms(u.lastSync) ? dm(ms(u.lastSync)) : t('never')) + '</td><td class="acts">' + acts + '</td></tr>'
    }).join('')
  }

  function render() {
    $('gym').textContent = report.gym || ''
    var entries = report.perDay.reduce(function (a, d) { return a + d.n }, 0)
    $('k-now').textContent = report.present.length
    $('k-entries').textContent = entries
    $('k-members').textContent = report.members
    $('k-avg').textContent = report.avgMin != null ? report.avgMin + ' min' : '–'
    $('k-users').textContent = users.length || '–'
    var week = Date.now() - 7 * 86400000
    $('k-active').textContent = users.filter(function (u) { return ms(u.lastSync) > week }).length
    var every = report.perDay.length > 31 ? 7 : 1
    bars($('chart-days'), report.perDay.map(function (d, i) {
      var day = new Date(d.d + 'T12:00:00')
      return { n: d.n, title: d.d, label: i % every ? '' : day.toLocaleDateString(loc, report.perDay.length > 7 ? { day: 'numeric' } : { weekday: 'short', day: 'numeric' }) }
    }), t('Entries per day'))
    var hours = []
    for (var h = 6; h <= 23; h++) hours.push({ n: 0, title: h + ':00', label: h % 3 ? '' : String(h) })
    report.visits.forEach(function (v) { var h = new Date(v.in).getHours(); if (h >= 6) hours[h - 6].n++ })
    bars($('chart-hours'), hours, t('Busiest hours'))
    $('present').innerHTML = report.present.length ? report.present.map(function (p) { return '<li><span>' + esc(p.name || '?') + '</span><span class="num dim">' + hm(p.in) + '</span></li>' }).join('') : '<li class="dim">' + t('Nobody right now.') + '</li>'
    renderVisits()
    renderMembers()
  }

  function load() {
    var days = $('days').value
    return Promise.all([get('/admin/visits?days=' + days), get('/admin/cards'), get('/admin/users').catch(function () { return { users: [] } })])
      .then(function (r) {
        report = r[0]; members = r[1].members || []; users = r[2].users || []
        $('gate').hidden = true; $('app').hidden = false
        render()
      })
      .catch(function (e) {
        $('app').hidden = true; $('gate').hidden = false
        if (e.message) $('gate').querySelector('p').textContent = e.message
      })
  }

  $('days').addEventListener('change', load)
  $('refresh').addEventListener('click', load)
  $('filter').addEventListener('input', renderVisits)
  $('members').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]')
    if (!b) return
    var act = b.getAttribute('data-act')
    if (act === 'reissue' && !window.confirm(t('Make a new QR? The old one stops working.'))) return
    post('/admin/cards', { userId: b.getAttribute('data-id'), action: act === 'reissue' ? 'issue' : act }).then(load).catch(function (err) { window.alert(err.message) })
  })
  $('desk').addEventListener('submit', function (e) {
    e.preventDefault()
    var v = $('desk-num').value.trim()
    if (!v) return
    var out = $('desk-out')
    post('/admin/scan', { qr: v }).then(function (r) {
      out.className = 'desk-out ok'
      out.textContent = r.name + ' ' + t(r.dir === 'in' ? 'checked in' : 'checked out') + ' · ' + hm(r.at)
      $('desk-num').value = ''
      load()
    }).catch(function (err) { out.className = 'desk-out bad'; out.textContent = err.message })
  })
  $('csv').addEventListener('click', function () {
    var rows = [[t('Member'), t('Date'), t('Entry'), t('Exit'), t('Duration'), t('How')]].concat((report ? report.visits : []).map(function (v) {
      return [v.name || '', v.in.slice(0, 10), hm(v.in), v.out ? hm(v.out) : '', v.out ? Math.round((Date.parse(v.out) - Date.parse(v.in)) / 60000) : '', v.auto ? 'auto' : v.by]
    }))
    var csv = rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c }).join(';') }).join('\n')
    var a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'entradas-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
  })
  load()
  setInterval(function () { if (!document.hidden) load() }, 60000)
})()
