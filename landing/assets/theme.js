// The site's light/dark switch. Without a saved choice the page follows the system (site.css,
// prefers-color-scheme); the button saves the other one for every page. Loaded in <head> so the
// saved theme is applied before the first paint. The only script on the public site.
(function () {
  var root = document.documentElement, KEY = 'serie-theme'
  try { var saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved) } catch (e) {}
  var current = function () {
    return root.getAttribute('data-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  }
  var sync = function () {
    var on = current() === 'light'
    var btns = document.querySelectorAll('.theme-toggle')
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', on ? 'true' : 'false')
  }
  document.addEventListener('DOMContentLoaded', sync)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.theme-toggle')
    if (!b) return
    var next = current() === 'light' ? 'dark' : 'light'
    root.setAttribute('data-theme', next)
    try { localStorage.setItem(KEY, next) } catch (err) {}
    sync()
  })
})()
