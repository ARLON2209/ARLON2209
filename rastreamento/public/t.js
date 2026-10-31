/*
 * Script de rastreamento próprio. Instale no site do cliente:
 *   <script async src="https://track.SEUDOMINIO.com.br/t.js" data-client="butzke" data-wa="butzke-site"></script>
 * - data-client: slug do cliente (obrigatório)
 * - data-wa: slug do link de rastreio. Se informado, todo botão wa.me / api.whatsapp.com do site
 *   passa pelo link de rastreio, que gera o código e guarda a origem (UTM, gclid, fbclid).
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var BASE = s.src.replace(/\/t\.js(\?.*)?$/, '');
  var CLIENT = s.getAttribute('data-client');
  var WA_SLUG = s.getAttribute('data-wa');
  if (!CLIENT) return;

  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
  var ORIGIN_TTL = 30 * 86400000; // origem vale por 30 dias (último clique)

  function getCookie(k) {
    var m = document.cookie.match('(?:^|;)\\s*' + k + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(k, v, days) {
    document.cookie = k + '=' + encodeURIComponent(v) + ';path=/;max-age=' + days * 86400 + ';SameSite=Lax' +
      (location.protocol === 'https:' ? ';Secure' : '');
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // Visitante
  var vid = getCookie('_vid');
  if (!/^[0-9a-f-]{36}$/i.test(vid || '')) vid = uuid();
  setCookie('_vid', vid, 365);

  // Origem: se a URL traz UTM ou ID de clique, vira a origem atual (último clique)
  var params = new URLSearchParams(location.search);
  var fromUrl = {}, newTouch = false;
  KEYS.forEach(function (k) { var v = params.get(k); if (v) { fromUrl[k] = v; newTouch = true; } });
  if (fromUrl.fbclid) {
    var oldFbc = getCookie('_fbc');
    if (!oldFbc || oldFbc.split('.').pop() !== fromUrl.fbclid) setCookie('_fbc', 'fb.1.' + Date.now() + '.' + fromUrl.fbclid, 90);
  }
  if (newTouch) store('_trk_origin', JSON.stringify({ ts: Date.now(), o: fromUrl, landing: location.href }));

  function origin() {
    try {
      var saved = JSON.parse(load('_trk_origin') || 'null');
      if (saved && Date.now() - saved.ts < ORIGIN_TTL) return saved;
    } catch (e) {}
    return { o: {}, landing: null };
  }

  function send(path, body) {
    var data = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon(BASE + path, new Blob([data], { type: 'text/plain' }))) return;
    try { fetch(BASE + path, { method: 'POST', body: data, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) {}
  }

  // track('Contact') -> devolve o event_id (use o mesmo no Pixel: fbq('track','Contact',{}, {eventID: id}))
  function track(name, data) {
    data = data || {};
    var id = uuid();
    send('/collect', {
      client: CLIENT, event_id: id, name: name, vid: vid,
      url: location.href, ref: document.referrer || null,
      utm: origin().o, fbc: getCookie('_fbc'), fbp: getCookie('_fbp'),
      new_touch: name === 'PageView' && newTouch,
      value: data.value, currency: data.currency
    });
    return id;
  }
  window.trk = { track: track, vid: vid };

  // Botões de WhatsApp: passam pelo link de rastreio com a origem anexada
  var WA_RE = /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|^whatsapp:/i;
  function trackedHref(href) {
    var isOurs = href.indexOf(BASE + '/w/') === 0;
    if (!isOurs && !(WA_SLUG && WA_RE.test(href))) return null;
    var url = new URL(isOurs ? href : BASE + '/w/' + WA_SLUG);
    var o = origin();
    url.searchParams.set('vid', vid);
    KEYS.forEach(function (k) { if (o.o[k]) url.searchParams.set(k, o.o[k]); });
    var fbc = getCookie('_fbc'), fbp = getCookie('_fbp');
    if (fbc) url.searchParams.set('fbc', fbc);
    if (fbp) url.searchParams.set('fbp', fbp);
    url.searchParams.set('landing', (o.landing || location.href).slice(0, 1000));
    return url.toString();
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = trackedHref(a.getAttribute('href') || '');
    if (!href) return;
    a.setAttribute('href', href);
    track('Contact');
  }, true);

  track('PageView');
})();
