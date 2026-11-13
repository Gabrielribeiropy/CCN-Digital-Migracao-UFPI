import { fetchUpstream, publicHttpUrl } from './_lib/fetch-upstream.mjs';
import { allowPublicRequest } from './_lib/public-rate-limit.mjs';
import { readConfig } from './_lib/config-store.mjs';

const hiddenChrome = '<style>html,body{max-width:100%;overflow-x:hidden;margin:0}#header,#footer,#gotop,.backtotop,.br-skiplink,.br-breadcrumb,#main-navigation,.menu-scrim,header,footer,[id*="cookie"],[class*="cookie"],[id*="consent"],[class*="consent"],[id*="lgpd"],[class*="lgpd"],.cc-window,.cc-revoke{display:none!important}#main,.container-lg,.main-content,.row,.col{max-width:100%!important;margin:0!important;padding:0!important}.main-content{padding:18px!important}img,video,table{max-width:100%!important;height:auto}table{display:block;overflow-x:auto}</style>';

function safePublicUrl(value) {
  return publicHttpUrl(value);
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function canEmbedUrl(target) {
  const host = target.hostname.toLowerCase();
  const legacySystems = ['sigaa.ufpi.br', 'www.sigaa.ufpi.br', 'sipac.ufpi.br', 'www.sipac.ufpi.br', 'sigadmin.ufpi.br', 'www.sigadmin.ufpi.br'];
  return (host === 'ufpi.br' || host.endsWith('.ufpi.br')) && !legacySystems.includes(host);
}

function externalLanding(target, origin) {
  const url = target.toString();
  const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const message = scriptJson({ type: 'ccn-open-external', url });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abrir no navegador</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8fc;color:#10243b;font:16px system-ui}.card{max-width:330px;margin:24px;padding:28px;border-radius:20px;background:#fff;text-align:center}a{display:inline-block;margin-top:14px;padding:12px 16px;border-radius:12px;background:#075ca8;color:#fff;font-weight:700;text-decoration:none}</style><main class="card"><h1>Esta página abre melhor no navegador</h1><p>Continue para visualizar o site no celular.</p><a href="${escaped}" target="_blank" rel="noopener">Abrir no navegador</a></main><script>const message=${message};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else if(window.parent!==window)window.parent.postMessage(message,${scriptJson(origin)});else location.replace(${scriptJson(url)});</script>`;
}

function unavailable(target) {
  const url = String(target).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8fc;color:#10243b;font:16px system-ui}.card{max-width:330px;margin:24px;padding:28px;border-radius:20px;background:#fff;box-shadow:0 16px 44px rgba(20,67,111,.13)}h1{font-size:21px;margin:0 0 10px}p{color:#58708a;line-height:1.55}.url{font-size:12px;overflow-wrap:anywhere;color:#075ca8}</style><main class="card"><h1>Não foi possível conectar à fonte oficial.</h1><p>Tente recarregar em alguns instantes.</p><div class="url">${url}</div></main>`;
}

function requestOrigin(request) {
  try {
    const forwardedProtocol = String(request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const forwardedHost = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
    if (!['http', 'https'].includes(forwardedProtocol) || !forwardedHost) return null;
    return new URL(`${forwardedProtocol}://${forwardedHost}`).origin;
  } catch { return null; }
}

function pdfLanding(target, origin) {
  const viewer = `${origin}/pdf-viewer/index.html?url=${encodeURIComponent(target)}`;
  const message = scriptJson({ type: 'ccn-open-document', url: target, title: 'Documento PDF' });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Documento PDF</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8fc;color:#10243b;font:16px system-ui}.card{margin:24px;padding:26px;border-radius:16px;background:white;text-align:center}a{display:inline-block;margin-top:14px;color:#075ca8;font-weight:700}</style><main class="card"><strong>Abrindo PDF no CCN Digital…</strong><br><a href="${viewer}">Visualizar PDF</a></main><script>const message=${message};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else if(window.parent!==window)window.parent.postMessage(message,${scriptJson(origin)});else location.replace(${scriptJson(viewer)});</script>`;
}

const mobileLayout = '<style>*,*::before,*::after{box-sizing:border-box!important}html,body,#main,#main-content,.container,.container-lg,.container-fluid,.row,.col,.item-page,.com-content-article,.com-content-article__body{width:100%!important;min-width:0!important;max-width:100%!important}html,body{overflow-x:hidden!important}*::-webkit-scrollbar:horizontal{height:0!important}table{scrollbar-width:none!important}.com-content-article h1,.com-content-article p,.com-content-article span{white-space:normal!important;overflow-wrap:anywhere!important}@media(max-width:600px){.com-content-article__body p[style*="padding-left"]{padding-left:16px!important}}</style>';
// No celular, tabelas com varias colunas viram fichas sem rolagem lateral.
const readerLayout = `<style>
.ccn-image-fallback{display:inline-flex;align-items:center;justify-content:center;max-width:100%;min-height:28px;padding:4px 9px;border:1px solid #b9cede;border-radius:6px;background:#edf5fb;color:#123d65!important;font:700 12px/1.2 Arial,Roboto,sans-serif!important;vertical-align:middle;text-decoration:none!important}
.ccn-image-fallback--missing{font-weight:500!important;color:#58708a!important}
.com-content-article,.item-page{font-family:Arial,Roboto,sans-serif!important;color:#142333!important}
.com-content-article h1,.com-content-article h2,.com-content-article h3,.item-page h1,.item-page h2,.item-page h3{font-family:Arial,Roboto,sans-serif!important;font-weight:700!important;line-height:1.3!important;letter-spacing:-.02em!important;text-align:center!important}
.com-content-article h1,.item-page h1{font-size:26px!important}
.com-content-article h2,.item-page h2{font-size:19px!important}
.com-content-article h3,.item-page h3{font-size:17px!important}
.com-content-article .article-info,.item-page .article-info{justify-content:center!important;text-align:center!important;flex-wrap:wrap!important;font-size:12px!important;line-height:1.5!important;margin:0 16px 20px!important}
.com-content-article__body,.com-content-article__body p,.com-content-article__body span,.com-content-article__body strong,.com-content-article__body a,.com-content-article__body li,.item-page p,.item-page p span{font-family:Arial,Roboto,sans-serif!important;font-size:15px!important;line-height:1.5!important}
.com-content-article__body h1 span,.com-content-article__body h2 span,.com-content-article__body h3 span{font-size:inherit!important}
.com-content-article__body p{margin:0 0 12px!important}
@media(max-width:600px){
.com-content-article__body table.ccn-wide-table,.com-content-article__body table.ccn-wide-table tbody{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;overflow:visible!important}
.com-content-article__body table.ccn-wide-table tr{display:block!important;width:100%!important;height:auto!important;margin:0 0 14px!important;padding:12px!important;border:1px solid #d9e5ef!important;border-radius:12px!important;background:#fff!important}
.com-content-article__body table.ccn-wide-table tr.ccn-table-heading{display:none!important}
.com-content-article__body table.ccn-wide-table td,.com-content-article__body table.ccn-wide-table th{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;padding:7px 0!important;border:0!important;vertical-align:top!important;font-family:Arial,Roboto,sans-serif!important;font-size:14px!important;line-height:1.45!important;overflow-wrap:anywhere!important;text-align:left!important}
.com-content-article__body table.ccn-wide-table td::before,.com-content-article__body table.ccn-wide-table th::before{content:attr(data-ccn-label);display:block;font-weight:700;color:#173d65;margin-bottom:2px}
}
</style>`;

export function proxyHtml(html, target, origin) {
  const base = new URL('.', target).toString();
  const proxiedImages = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const source = tag.match(/\s(?:src|data-src)=(['"])(.*?)\1/i)?.[2];
    if (!source) return tag;
    try {
      const image = new URL(source.replace(/&amp;/gi, '&'), target);
      if (!canEmbedUrl(image)) return tag;
      if (/\.svg$/i.test(image.pathname)) return tag;
      const proxy = `${origin}/api/media?url=${encodeURIComponent(image.toString())}`.replace(/&/g, '&amp;');
      const original = image.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return tag.replace(/\s(?:srcset|data-srcset|loading)=(['"]).*?\1/gi, '').replace(/\s(?:src|data-src)=(['"]).*?\1/gi, '').replace(/\s*\/>$/, ` src="${proxy}" data-ccn-original-src="${original}" />`).replace(/(?<!\/)\>$/, ` src="${proxy}" data-ccn-original-src="${original}">`);
    } catch { return tag; }
  });
  const bridge = `<script>(function(){
    function send(message){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else window.parent.postMessage(message,'*')}
    function replaceBrokenImage(img){
      if(!img||img.tagName!=='IMG'||!img.parentNode||img.dataset.ccnFallback)return;
      var original=img.getAttribute('data-ccn-original-src');
      if(original&&img.dataset.ccnDirectAttempt!=='1'){
        try{var direct=new URL(original);if(direct.protocol==='https:'&&(direct.hostname==='ufpi.br'||direct.hostname.endsWith('.ufpi.br'))){img.dataset.ccnDirectAttempt='1';img.removeAttribute('srcset');img.src=direct.href;return}}catch(_){}
      }
      img.dataset.ccnFallback='1';
      var alt=img.getAttribute('alt')||'';
      // Ícones antigos do portal oficial podem desaparecer da origem. Evita
      // mostrar o nome do arquivo como uma sequência de letras quebradas.
      if(/^A{8,}[0-9]*$/i.test(alt)){
        var emptyLink=img.closest('a[href]');
        if(emptyLink&&emptyLink.textContent.trim()===''){
          try{
            var destination=new URL(emptyLink.href);
            if((destination.hostname==='leg.ufpi.br'||destination.hostname==='www.leg.ufpi.br')&&(destination.pathname==='/cc'||destination.pathname==='/cc/')){emptyLink.remove();return}
          }catch(_){}
        }
        img.remove();
        return;
      }
      var pdf=/PDF/i.test(alt+' '+(img.getAttribute('src')||''));
      var fallback=document.createElement('span');
      fallback.className='ccn-image-fallback'+(pdf?'':' ccn-image-fallback--missing');
      fallback.textContent=pdf?'PDF':'Imagem indisponível';
      fallback.setAttribute('role','img');
      fallback.setAttribute('aria-label',pdf?'Documento PDF':'Imagem indisponível na fonte oficial');
      img.replaceWith(fallback);
    }
    document.addEventListener('error',function(event){if(event.target&&event.target.tagName==='IMG')replaceBrokenImage(event.target)},true);
    function replaceAlreadyBrokenImages(){document.querySelectorAll('img').forEach(function(img){if(img.complete&&img.naturalWidth===0)replaceBrokenImage(img)})}
    var contentReady=false;
    function signalContentReady(){if(contentReady)return;var content=document.querySelector('.com-content-article__body,.item-page,article')||(document.readyState!=='loading'?document.querySelector('main,[role="main"]'):null);if(content&&(content.textContent||'').trim().length>20){contentReady=true;readyObserver.disconnect();send({type:'ccn-page-ready'})}}
    var readyObserver=new MutationObserver(signalContentReady);
    readyObserver.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',signalContentReady,{once:true});
    setTimeout(signalContentReady,1200);
    function cleanWidgets(){document.querySelectorAll('#gotop,.backtotop,[id*="cookie"],[class*="cookie"],[id*="consent"],[class*="consent"],[id*="lgpd"],[class*="lgpd"],.cc-window,.cc-revoke').forEach(function(node){node.remove()})}
    function adaptTables(){document.querySelectorAll('.com-content-article__body table').forEach(function(table){var row=table.querySelector('tr');if(!row||row.children.length<3)return;table.classList.add('ccn-wide-table');row.classList.add('ccn-table-heading');var labels=Array.from(row.children).map(function(cell){return(cell.textContent||'').trim().replace(/\\s+/g,' ')});table.querySelectorAll('tr:not(.ccn-table-heading)').forEach(function(dataRow){Array.from(dataRow.children).forEach(function(cell,index){cell.setAttribute('data-ccn-label',labels[index]||'Informação')})})})}
    function restoreInstitutionalEmails(){document.querySelectorAll('joomla-hidden-mail[text]').forEach(function(node){try{var mail=atob(node.getAttribute('text')||'');if(!/^[^\\s@<>]+@ufpi\\.edu\\.br$/i.test(mail))return;var link=document.createElement('a');link.href='mailto:'+mail;link.textContent=mail;node.replaceWith(link)}catch(_){}})}
    var cleanScheduled=false;
    function scheduleClean(){if(cleanScheduled)return;cleanScheduled=true;setTimeout(function(){cleanScheduled=false;cleanWidgets()},0)}
    var reportedLayout=false;
    function checkLayout(){
      if(reportedLayout||screen.width>600)return;
      var width=screen.width;
      var viewport=document.documentElement.clientWidth;
      var broken=viewport>width*1.3;
      if(!broken){
        var content=document.querySelector('.com-content-article__body,main,#main-content,.main-content')||document.body;
        broken=content.scrollWidth>viewport*1.5;
      }
      if(broken){reportedLayout=true;send({type:'ccn-incompatible-layout',url:${JSON.stringify(target)}})}
    }
    function start(){signalContentReady();cleanWidgets();adaptTables();restoreInstitutionalEmails();replaceAlreadyBrokenImages();new MutationObserver(function(){scheduleClean();adaptTables();restoreInstitutionalEmails()}).observe(document.documentElement,{childList:true,subtree:true});setTimeout(cleanWidgets,400);setTimeout(cleanWidgets,1600);setTimeout(checkLayout,500);setTimeout(checkLayout,1600)}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
    document.addEventListener('click',function(e){
      var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var href=a.href||'';var host='';try{host=new URL(href).hostname}catch(_){}
      var deviceLink=/^(mailto:|tel:|sms:|geo:|maps:|comgooglemaps:|waze:)/i.test(href);var mapLink=/(^|\\.)(google\\.[^/]+|maps\\.app\\.goo\\.gl|maps\\.apple\\.com|waze\\.com)$/i.test(host)&&/(maps|waze)/i.test(href);
      if(deviceLink||mapLink){e.preventDefault();send({type:'ccn-open-external',url:href});return}
      if(!/^https?:/i.test(href))return;
      e.preventDefault();
      if(/\\.pdf(?:$|[?#])/i.test(href)){send({type:'ccn-open-document',url:href,title:(a.textContent||'Documento PDF').trim()});return}
      var official=host==='ufpi.br'||host.endsWith('.ufpi.br');
      var legacy=['sigaa.ufpi.br','www.sigaa.ufpi.br','sipac.ufpi.br','www.sipac.ufpi.br','sigadmin.ufpi.br','www.sigadmin.ufpi.br'].includes(host);
      if(!official||legacy){send({type:'ccn-open-external',url:href});return}
      location.href=${scriptJson(`${origin}/api/portal?url=`)}+encodeURIComponent(href)
    },true)
  })()</script>`;
  const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1">';
  const stripped = proxiedImages.replace(/<meta[^>]+http-equiv=(['"])Content-Security-Policy\1[^>]*>/gi, '').replace(/<meta[^>]+name=(['"])viewport\1[^>]*>/gi, '');
  return stripped.includes('<head>') ? stripped.replace('<head>', `<head>${viewport}<base href="${base.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${hiddenChrome}${mobileLayout}${readerLayout}${bridge}`) : `${viewport}<base href="${base.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${hiddenChrome}${mobileLayout}${readerLayout}${bridge}${stripped}`;
}

export const config = { maxDuration: 30 };

export default async function handler(request, response) {
  const target = safePublicUrl(request.query.url || '');
  const quota = await allowPublicRequest(request, 'portal', target);
  if (!quota.allowed) { response.setHeader('retry-after', String(quota.retryAfter)); return response.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' }); }
  if (!target) return response.status(400).json({ error: 'URL inválida para conteúdo integrado.' });
  // Sistemas institucionais marcados como diretos mantêm módulos e autenticação
  // na origem oficial. O APK anterior ainda chega aqui pelo proxy.
  const institutionalHost = target.hostname.toLowerCase() === 'ufpi.br' || target.hostname.toLowerCase().endsWith('.ufpi.br');
  const configuredDirect = institutionalHost && target.hostname.toLowerCase() !== 'ccndigital.ufpi.br' && target.protocol === 'https:' && await readConfig().then((appConfig) =>
    Object.values(appConfig.integratedLinks).some((link) => link.openMode === 'direct' && link.url === target.toString())
  ).catch(() => false);
  if (target.hostname.toLowerCase() === 'ccndigital.ufpi.br' || configuredDirect) {
    target.protocol = 'https:';
    response.setHeader('cache-control', 'no-store');
    response.setHeader('location', target.toString());
    return response.status(302).send('');
  }
  try {
    const upstream = await fetchUpstream(target, { headers: { 'user-agent': 'CCN-Mobile/1.0 (+https://ufpi.br/ccn)' }, signal: AbortSignal.timeout(25_000) });
    if (!upstream.ok) return response.status(upstream.status).json({ error: 'A fonte oficial não respondeu.' });
    const finalTarget = publicHttpUrl(upstream.headers.get('x-ccn-final-url')) || target;
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('content-type', contentType);
    const binary = Buffer.from(await upstream.arrayBuffer());
    const isPdf = contentType.toLowerCase().includes('application/pdf') || binary.subarray(0, 5).toString() === '%PDF-';
    if (/text\/html/i.test(contentType) && !isPdf) {
      response.setHeader('content-security-policy', 'sandbox allow-scripts allow-forms allow-downloads allow-popups');
      const origin = requestOrigin(request);
      if (!origin) return response.status(400).json({ error: 'Origem da aplicação inválida.' });
      if (!canEmbedUrl(finalTarget)) return response.status(200).send(externalLanding(finalTarget, origin));
      return response.status(200).send(proxyHtml(binary.toString('utf8'), finalTarget, origin));
    }
    if (isPdf && request.query.download !== '1' && request.query.raw !== '1') {
      response.setHeader('content-security-policy', 'sandbox allow-scripts allow-forms allow-downloads allow-popups');
      const origin = requestOrigin(request);
      if (!origin) return response.status(400).json({ error: 'Origem da aplicação inválida.' });
      response.setHeader('content-type', 'text/html; charset=utf-8');
      return response.status(200).send(pdfLanding(finalTarget.toString(), origin));
    }
    if (isPdf) response.setHeader('content-type', 'application/pdf');
    else response.setHeader('content-disposition', 'attachment');
    if (request.query.download === '1') response.setHeader('content-disposition', 'attachment');
    return response.status(200).send(binary);
  } catch {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    return response.status(502).json({ error: 'Não foi possível acessar a fonte oficial.', url: target.toString() });
  }
}
