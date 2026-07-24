/* Віджет-інформер «Ціни на пальне в Україні» від diesel-monitor.pp.ua.
   Встроєння на будь-який сайт:
     <div id="diesel-monitor-widget"></div>
     <script src="https://diesel-monitor.pp.ua/widget.js" async></script>
   Самодостатній, без залежностей, ізольовані inline-стилі. Дає посилання
   на diesel-monitor.pp.ua (зворотне посилання) + свіжі ціни щодня. */
(function () {
  'use strict';
  var SITE = 'https://diesel-monitor.pp.ua';
  var C = { bg: '#0a0e12', surf: '#111820', ac: '#00d2aa', red: '#ff5f5f', mut: '#5a7a72', txt: '#e0ede9', line: 'rgba(0,210,170,0.15)' };
  var FUELS = [['Дизель', 'dp'], ['А-95+', 'a95p'], ['А-95', 'a95'], ['А-92', 'a92'], ['Автогаз', 'gas']];

  function fmt(v) { return v == null ? '—' : v.toFixed(2).replace('.', ','); }
  function chg(v) {
    if (v == null || Math.abs(v) < 0.005) return '<span style="color:' + C.mut + '">→</span>';
    var up = v > 0;
    return '<span style="color:' + (up ? C.red : C.ac) + '">' + (up ? '▲ +' : '▼ −') + fmt(Math.abs(v)) + '</span>';
  }

  function render(el, d) {
    var p = d.date.split('-');
    var rows = FUELS.filter(function (f) { return d.avg && d.avg[f[1]] != null; }).map(function (f) {
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid ' + C.line + '">' +
        '<span style="color:' + C.txt + '">' + f[0] + '</span>' +
        '<span><b style="color:' + C.ac + ';font-size:15px">' + fmt(d.avg[f[1]]) + '</b> ' +
        '<span style="color:' + C.mut + ';font-size:10px">грн/л</span> ' +
        '<span style="font-size:11px">' + chg(d.avgChange && d.avgChange[f[1]]) + '</span></span></div>';
    }).join('');
    el.innerHTML =
      '<div style="max-width:320px;background:' + C.surf + ';border:1px solid ' + C.line + ';border-radius:8px;' +
      'padding:12px 14px;font-family:\'Courier New\',monospace;color:' + C.txt + ';box-sizing:border-box">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:' + C.ac + ';display:inline-block"></span>' +
      '<span style="font-size:11px;letter-spacing:.12em;color:' + C.ac + ';text-transform:uppercase">Ціни на пальне · UA</span>' +
      '<span style="margin-left:auto;font-size:10px;color:' + C.mut + '">' + p[2] + '.' + p[1] + '</span></div>' +
      rows +
      '<a href="' + SITE + '/?utm_source=widget" target="_blank" rel="noopener" ' +
      'style="display:block;margin-top:8px;font-size:10px;color:' + C.ac + ';text-decoration:none">⛽ Дані та графіки: diesel-monitor.pp.ua</a>' +
      '</div>';
  }

  function init() {
    var el = document.getElementById('diesel-monitor-widget');
    if (!el) return;
    fetch(SITE + '/data/latest.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { render(el, d); })
      .catch(function () {
        el.innerHTML = '<a href="' + SITE + '" style="font-family:monospace;color:#00d2aa">⛽ Ціни на пальне в Україні — diesel-monitor.pp.ua</a>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
