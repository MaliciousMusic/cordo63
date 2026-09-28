#!/usr/bin/env node
// Écrit, depuis js/co-data.js (LA source) :
//  - le HTML statique d'index.html entre les marqueurs <!-- XXX:DEBUT --> / <!-- XXX:FIN --> :
//    SERVICES (la grille de prix, lisible sans JS), PROCESS, HISTOIRE, AVIS, HORAIRES, FAQ ;
//  - les données structurées schema.org (JSONLD) : LocalBusiness + catalogue des services, FAQPage, WebSite ;
//  - llms.txt (la fiche de synthèse pour les assistants IA), sitemap.xml.
// Usage : node tools/build-pages.mjs   (après chaque modification des services, des horaires, de la FAQ…)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const SITE = ((readFileSync(INDEX, 'utf8').match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || 'https://maliciousmusic.github.io/cordo63/').replace(/\/?$/, '/');

// charge co-data.js dans un bac à sable (il s'accroche à window.CO)
const sandbox = { window: {}, console, location: { search: '' }, URLSearchParams };
sandbox.window.CO = { parisNow: () => new Date() };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js', 'co-data.js'), 'utf8'), sandbox);
const CO = sandbox.window.CO;
const S = CO.SHOP;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const delai = (d) => (d === 0 ? 'pendant qu’on attend' : d === 1 ? '24 h' : d <= 2 ? '48 h' : d <= 5 ? d + ' jours' : d <= 7 ? 'une semaine' : d <= 10 ? 'deux semaines' : 'sur rendez-vous');
CO.delaiTexte = delai;

/* ---------- la grille des services ---------- */
function servicesHTML() {
  const out = [];
  for (const r of CO.SERVICES) {
    out.push(`<section class="rubrique" id="r-${r.id}" aria-labelledby="r-${r.id}-t" data-rub="${r.id}">`);
    out.push(`  <h3 class="rub-titre" id="r-${r.id}-t">${esc(r.titre)}</h3>`);
    out.push('  <ul class="lignes">');
    for (const it of r.items) {
      out.push(`    <li class="ligne" id="s-${it.id}" data-id="${it.id}"><span class="l-nom">${esc(it.nom)}</span><span class="l-prix">${esc(CO.prixService(it))}</span><span class="l-desc">${esc(it.desc)}</span><span class="l-delai">${esc(delai(it.delai))}</span></li>`);
    }
    out.push('  </ul>');
    out.push('</section>');
  }
  return out.join('\n');
}

const processHTML = () => CO.PROCESS.map((p, i) => `<li class="etape" data-etape="${p.id}"><span class="e-num">${i + 1}</span><h3 class="e-titre">${esc(p.titre)}</h3><p>${esc(p.texte)}</p></li>`).join('\n');
const histoireHTML = () => CO.HISTOIRE.map((h) => `<h4>${esc(h.titre)}</h4>\n<p>${esc(h.texte)}</p>`).join('\n') + `\n<p class="source">D’après La Montagne (22 août 2023) et le compte Instagram de Clément.</p>`;
const avisHTML = () => [
  `<p class="avis-note"><span class="an-note">${String(S.avis.note).replace('.', ',')}</span><span class="an-etoiles" aria-hidden="true">★★★★★</span><span class="an-nb">${S.avis.nombre} avis Google (${S.avis.releve})</span></p>`,
  '<ul class="avis-liste">',
  ...CO.AVIS.map((a) => `  <li><blockquote><p>« ${esc(a.texte)} »</p></blockquote><span class="avis-qui">${esc(a.qui)}, ${esc(a.quand)}</span></li>`),
  '</ul>',
  `<p><a class="lien" href="${esc(S.avis.url)}" target="_blank" rel="noopener">Tous les avis sur Google <svg aria-hidden="true"><use href="#i-fleche"/></svg></a></p>`,
].join('\n');

function horairesHTML() {
  const ordre = [2, 3, 4, 5, 6, 0, 1];
  const rows = ordre.map((d) => {
    const pl = CO.HOURS.semaine[d];
    const txt = pl ? pl.map((p) => `${CO.fmtH(p[0])} – ${CO.fmtH(p[1])}`).join(' · ') : 'fermé';
    return `<tr data-j="${d}"${pl ? '' : ' class="ferme"'}><th scope="row">${CO.JOURS[d][0].toUpperCase() + CO.JOURS[d].slice(1)}</th><td>${txt}</td></tr>`;
  });
  return '<caption class="visuellement-cache">Horaires d’ouverture</caption>\n' + rows.join('\n');
}

const faqHTML = () => CO.FAQ.map((f) => `<details class="question"><summary><span role="heading" aria-level="3">${esc(f.q)}</span></summary><p>${esc(f.r)}</p></details>`).join('\n');

/* ---------- schema.org ---------- */
function jsonld() {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hh = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const hours = [];
  CO.HOURS.semaine.forEach((pl, d) => pl && pl.forEach((p) => hours.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/' + DAYS[d], opens: hh(p[0]), closes: hh(p[1]) })));
  const catalogue = {
    '@type': 'OfferCatalog',
    name: 'Services de cordonnerie, sneakers, maroquinerie et clés',
    itemListElement: CO.SERVICES.map((r) => ({
      '@type': 'OfferCatalog',
      name: r.titre,
      itemListElement: r.items.map((it) => {
        const o = { '@type': 'Offer', itemOffered: { '@type': 'Service', name: it.nom, description: it.desc } };
        if (it.prix != null) {
          if (it.des || it.devis) o.priceSpecification = { '@type': 'PriceSpecification', minPrice: it.prix, priceCurrency: 'EUR' };
          else { o.price = it.prix.toFixed(2); o.priceCurrency = 'EUR'; }
        }
        return o;
      }),
    })),
  };
  const business = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': SITE + '#cordo63',
    name: S.nom,
    alternateName: [S.marque, 'Cordonnerie du Mazet'],
    description: 'Cordonnerie de Clément Petit, place du Mazet à Clermont-Ferrand : talons, patins, ressemelage, nettoyage et restauration de sneakers, custom, maroquinerie, doubles de clés.',
    url: SITE,
    image: SITE + 'assets/img/og-cordo63.jpg',
    logo: SITE + 'assets/icons/icon-512.png',
    telephone: S.telIntl,
    priceRange: '€',
    paymentAccepted: S.paiements.join(', '),
    currenciesAccepted: 'EUR',
    address: { '@type': 'PostalAddress', streetAddress: S.adresse, postalCode: S.cp, addressLocality: S.ville, addressRegion: 'Auvergne-Rhône-Alpes', addressCountry: 'FR' },
    geo: { '@type': 'GeoCoordinates', latitude: S.geo.lat, longitude: S.geo.lng },
    hasMap: S.maps,
    openingHoursSpecification: hours,
    founder: { '@type': 'Person', name: S.artisan, jobTitle: 'Cordonnier' },
    foundingDate: S.societe.creation,
    knowsAbout: ['Cordonnerie', 'Ressemelage', 'Réparation de sneakers', 'Nettoyage de sneakers', 'Customisation de sneakers', 'Maroquinerie', 'Reproduction de clés'],
    areaServed: { '@type': 'City', name: 'Clermont-Ferrand' },
    sameAs: [S.instagram, S.instagramPerso, S.facebook],
    hasOfferCatalog: catalogue,
    potentialAction: { '@type': 'OrderAction', target: SITE + '#deposer', description: 'Préparer le dépôt d’une paire (ticket de réparation)' },
  };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: CO.FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })) };
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: S.nom, url: SITE, inLanguage: 'fr' };
  return [business, faq, site].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
}

/* ---------- llms.txt ---------- */
function llms() {
  const L = [];
  L.push(`# ${S.nom}`, '');
  L.push(`> Cordonnerie de ${S.artisan} au ${S.adresse}, ${S.repere}, ${S.cp} ${S.ville}. Talons, patins, ressemelage, nettoyage et restauration de sneakers, custom (Small Custom), maroquinerie et doubles de clés. Clément travaille derrière la vitrine (« Je suis ma vitrine »). Reprise de la cordonnerie du Mazet en juin 2023.`, '');
  L.push('## Infos pratiques');
  L.push(`- Adresse : ${S.adresse}, ${S.repere}, ${S.cp} ${S.ville}`);
  L.push(`- Téléphone : ${S.tel}`);
  L.push(`- Instagram : ${S.instagram} (atelier) · ${S.instagramPerso} (Clément) · ${S.custom} (custom)`);
  L.push(`- Note Google : ${String(S.avis.note).replace('.', ',')}/5 (${S.avis.nombre} avis, ${S.avis.releve})`);
  L.push(`- Paiement : ${S.paiements.join(', ')}`);
  L.push('- Sans rendez-vous. Dépôt préparé en ligne possible (ticket de réparation numéroté, suivi dans l’appli).', '');
  L.push('## Horaires');
  [2, 3, 4, 5, 6, 0, 1].forEach((d) => {
    const pl = CO.HOURS.semaine[d];
    L.push(`- ${CO.JOURS[d][0].toUpperCase() + CO.JOURS[d].slice(1)} : ${pl ? pl.map((p) => `${CO.fmtH(p[0])}–${CO.fmtH(p[1])}`).join(' et ') : 'fermé'}`);
  });
  L.push('');
  L.push('## Services et prix indicatifs (devis gratuit en boutique)');
  for (const r of CO.SERVICES) {
    L.push(`### ${r.titre}`);
    r.items.forEach((it) => L.push(`- ${it.nom} : ${CO.prixService(it)} — ${it.desc} (délai : ${delai(it.delai)})`));
  }
  L.push('');
  L.push('## Clément Petit');
  CO.HISTOIRE.forEach((h) => L.push(`- ${h.titre} : ${h.texte}`));
  L.push('');
  L.push('## Questions fréquentes');
  CO.FAQ.forEach((f) => L.push(`- ${f.q} ${f.r}`));
  L.push('');
  L.push(`Site : ${SITE}`);
  return L.join('\n') + '\n';
}

/* ---------- écriture ---------- */
let html = readFileSync(INDEX, 'utf8');
const put = (key, content) => {
  const re = new RegExp(`(<!-- ${key}:DEBUT -->)[\\s\\S]*?(<!-- ${key}:FIN -->)`);
  if (!re.test(html)) throw new Error('marqueur introuvable : ' + key);
  html = html.replace(re, `$1\n${content}\n$2`);
};
put('JSONLD', jsonld());
put('SERVICES', servicesHTML());
put('PROCESS', processHTML());
put('HISTOIRE', histoireHTML());
put('AVIS', avisHTML());
put('HORAIRES', horairesHTML());
put('FAQ', faqHTML());
writeFileSync(INDEX, html);
writeFileSync(join(ROOT, 'llms.txt'), llms());
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}llms.txt</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>
  <url><loc>${SITE}mentions-legales.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.1</priority></url>
</urlset>
`);
console.log(`index.html, llms.txt, sitemap.xml écrits (${CO.SERVICES.reduce((a, r) => a + r.items.length, 0)} services, ${CO.FAQ.length} questions) → ${SITE}`);
