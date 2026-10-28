/* ==========================================================================
   Prontuário Digital — Service Worker
   - deixa o app instalável e funcionando offline
   - verifica novas consultas no Supabase e avisa por notificação
   ========================================================================== */

const VERSAO = 'v1';
const CACHE_APP = 'prontuario-app-' + VERSAO;
const CACHE_ESTADO = 'prontuario-estado';

const SUPABASE_URL = 'https://kmcstymzpcdgsivzrzcs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KNOwvQkIwQmcWmUV1wgldA_S483Mlei';
const TABELA = 'prontuario_db';
const ROW = 'main';

const ICONE = './icons/icon-192.png';
const BADGE = './icons/badge-96.png';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/badge-96.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

/* ---------------- ciclo de vida ---------------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await Promise.all(ARQUIVOS.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter(n => n !== CACHE_APP && n !== CACHE_ESTADO)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---------------- estratégias de cache ---------------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* API do Supabase: sempre rede (nunca servir dado clínico do cache) */
  if (url.hostname.endsWith('supabase.co')) return;

  /* SDK do Supabase via CDN: cache-first (precisa funcionar offline) */
  if (url.href.includes('supabase-js')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 503 });
      }
    })());
    return;
  }

  /* fontes do Google: cache-first, rede como atualização */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      const hit = await cache.match(req);
      const fetchPromise = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || fetchPromise || new Response('', { status: 503 });
    })());
    return;
  }

  /* navegação: rede primeiro, caindo para o app em cache quando offline */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_APP);
        cache.put('./index.html', res.clone()).catch(() => {});
        return res;
      } catch (e) {
        const cache = await caches.open(CACHE_APP);
        return (await cache.match('./index.html')) || (await cache.match('./')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  /* demais arquivos do próprio app */
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 503 });
      }
    })());
  }
});

/* ---------------- estado (última consulta avisada) ---------------- */
async function lerEstado() {
  try {
    const cache = await caches.open(CACHE_ESTADO);
    const res = await cache.match('./estado.json');
    return res ? await res.json() : {};
  } catch (e) {
    return {};
  }
}

async function gravarEstado(obj) {
  try {
    const cache = await caches.open(CACHE_ESTADO);
    await cache.put('./estado.json', new Response(JSON.stringify(obj), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (e) {}
}

/* ---------------- consultas ---------------- */
function timestamp(valor) {
  if (!valor) return 0;
  const t = new Date(String(valor).replace(' ', 'T'));
  return isNaN(t) ? 0 : t.getTime();
}

function consultaMaisRecente(pacientes) {
  let melhor = null;
  (pacientes || []).forEach(p => {
    (p.consultas || []).forEach(c => {
      const ts = timestamp(c.data);
      if (!melhor || ts > melhor.ts) {
        melhor = { ts, data: c.data, tipo: c.tipo || 'Consulta', nome: p.nome || 'Paciente' };
      }
    });
  });
  return melhor;
}

function dataCurta(valor) {
  const t = new Date(String(valor || '').replace(' ', 'T'));
  if (isNaN(t)) return '';
  return t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' +
    t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function buscarDadosNuvem() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABELA}?select=data&id=eq.${ROW}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        cache: 'no-store'
      }
    );
    if (!res.ok) return null;
    const linhas = await res.json();
    return linhas && linhas[0] && linhas[0].data ? linhas[0].data : null;
  } catch (e) {
    return null;
  }
}

async function notificar(titulo, corpo, tag) {
  try {
    await self.registration.showNotification(titulo, {
      body: corpo,
      icon: ICONE,
      badge: BADGE,
      tag: tag || 'consulta',
      renotify: true,
      vibrate: [90, 60, 90],
      lang: 'pt-BR',
      data: { url: './' }
    });
    if (self.navigator && self.navigator.setAppBadge) {
      self.navigator.setAppBadge(1).catch(() => {});
    }
  } catch (e) {
    /* permissão não concedida ou navegador sem suporte */
  }
}

async function verificarNovasConsultas() {
  const dados = await buscarDadosNuvem();
  if (!dados || !Array.isArray(dados.patients)) return;

  const nova = consultaMaisRecente(dados.patients);
  if (!nova) return;

  const estado = await lerEstado();

  if (!estado.ultimaConsultaTs) {
    await gravarEstado({ ultimaConsultaTs: nova.ts, ultimaConsultaData: nova.data });
    return;
  }

  if (nova.ts > Number(estado.ultimaConsultaTs)) {
    await gravarEstado({ ultimaConsultaTs: nova.ts, ultimaConsultaData: nova.data });
    await notificar(
      'Nova consulta registrada',
      `${nova.nome} · ${nova.tipo}${nova.data ? ' · ' + dataCurta(nova.data) : ''}`,
      'consulta'
    );
  }
}

/* ---------------- mensagens da página ---------------- */
self.addEventListener('message', event => {
  const msg = event.data || {};

  if (msg.type === 'estado' && typeof msg.ultimaConsultaTs === 'number') {
    event.waitUntil(gravarEstado({
      ultimaConsultaTs: msg.ultimaConsultaTs,
      ultimaConsultaData: msg.ultimaConsultaData || ''
    }));
  }

  if (msg.type === 'teste') {
    event.waitUntil(notificar(
      'Prontuário Digital',
      'Notificações ativas. Você será avisada quando uma nova consulta for registrada.',
      'teste'
    ));
  }

  if (msg.type === 'consulta' && msg.consulta) {
    const c = msg.consulta;
    event.waitUntil((async () => {
      await gravarEstado({ ultimaConsultaTs: timestamp(c.data), ultimaConsultaData: c.data });
      await notificar('Nova consulta registrada', `${c.nome} · ${c.tipo || 'Consulta'}${c.data ? ' · ' + dataCurta(c.data) : ''}`, 'consulta');
    })());
  }

  if (msg.type === 'verificar-agora') {
    event.waitUntil(verificarNovasConsultas());
  }
});

/* ---------------- segundo plano ---------------- */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'checar-consultas') event.waitUntil(verificarNovasConsultas());
});

self.addEventListener('sync', event => {
  if (event.tag === 'checar-consultas') event.waitUntil(verificarNovasConsultas());
});

/* ---------------- clique na notificação ---------------- */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    try {
      if (self.navigator && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    } catch (e) {}
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const janela of janelas) {
      if ('focus' in janela) {
        await janela.focus();
        janela.postMessage({ type: 'abrir-consultas' });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow('./');
  })());
});
