/* ==========================================================================
   Cordo 63 — les commandes : le carnet de tickets de l'atelier
   Une commande = un ticket de réparation jaune, numéroté : ce qu'on apporte, ce qu'il faut
   faire, quand on passe, qui on est, et où ça en est (envoyée → déposée → à l'établi →
   finitions → prête → rendue).

   Maquette : tout vit sur l'appareil (localStorage), le client ET l'espace atelier lisent le
   même carnet : on peut montrer au client le parcours complet sur un seul téléphone.
   Production : brancher CO.BACKEND (voir tools/supabase/schema.sql et le README) ; l'API
   ci-dessous ne change pas, seules les fonctions `distant.*` parlent au serveur.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});

  // Production (à remplir) : { type: 'supabase', url: 'https://xxxx.supabase.co', cle: '<clé publique anon>' }
  CO.BACKEND = CO.BACKEND || null;

  const CLE = 'commandes', MIENNES = 'mes-tickets', CPT = 'compteur';
  const ORDRE = CO.STATUTS.map((s) => s.id);

  const lire = () => {
    const a = CO.store.get(CLE, []);
    return Array.isArray(a) ? a : [];
  };
  const ecrire = (a) => { CO.store.set(CLE, a); CO.emit('commandes', a); };
  const mesNums = () => {
    const a = CO.store.get(MIENNES, []);
    return Array.isArray(a) ? a : [];
  };

  /* le prochain numéro de ticket (un carnet à souches : ça commence quelque part, puis ça suit) */
  function prochainNumero() {
    let n = CO.store.get(CPT, 0);
    if (!n) n = 400 + Math.floor(Math.random() * 180);
    n += 1;
    CO.store.set(CPT, n);
    return String(n).padStart(4, '0');
  }

  const maintenant = () => new Date().toISOString();

  /* ---------- le serveur (production) ---------- */
  const distant = {
    actif: () => !!(CO.BACKEND && CO.BACKEND.type === 'supabase' && CO.BACKEND.url && CO.BACKEND.cle),
    async envoyer(cmd) {
      // insertion via l'API REST de Supabase ; la politique RLS n'autorise que l'insertion anonyme
      const r = await fetch(CO.BACKEND.url.replace(/\/$/, '') + '/rest/v1/commandes', {
        method: 'POST',
        headers: { apikey: CO.BACKEND.cle, Authorization: 'Bearer ' + CO.BACKEND.cle, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ donnees: cmd, telephone: cmd.client.tel, statut: cmd.statut }),
      });
      if (!r.ok) throw new Error('envoi ' + r.status);
      const [row] = await r.json();
      return row && row.numero ? String(row.numero).padStart(4, '0') : null;
    },
    async suivre(num, tel) {
      // fonction SQL « suivi(numero, telephone) » : ne renvoie que le statut, jamais les coordonnées
      const r = await fetch(CO.BACKEND.url.replace(/\/$/, '') + '/rest/v1/rpc/suivi', {
        method: 'POST',
        headers: { apikey: CO.BACKEND.cle, Authorization: 'Bearer ' + CO.BACKEND.cle, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_numero: +num, p_telephone: tel }),
      });
      if (!r.ok) throw new Error('suivi ' + r.status);
      return r.json();
    },
  };

  /* ---------- l'API ---------- */
  CO.Commandes = {
    get distant() { return distant.actif(); },

    /** tout le carnet (l'espace atelier), du plus récent au plus ancien */
    toutes() {
      return lire().sort((a, b) => (b.cree || '').localeCompare(a.cree || ''));
    },
    /** les tickets de ce téléphone (le client) */
    miennes() {
      const mine = new Set(mesNums());
      return this.toutes().filter((c) => mine.has(c.num));
    },
    actives() {
      return this.miennes().filter((c) => c.statut !== 'rendue');
    },
    get(num) {
      return lire().find((c) => c.num === String(num).padStart(4, '0')) || null;
    },
    rang(c) {
      return Math.max(0, ORDRE.indexOf(c.statut));
    },

    /** une nouvelle commande (côté client, ou au comptoir par Clément : { comptoir: true }) → la commande */
    async creer(d, { comptoir = false } = {}) {
      const cmd = {
        num: prochainNumero(),
        cree: maintenant(),
        objet: d.objet || 'autre',
        objetNom: d.objetNom || '',
        detail: d.detail || '',
        services: (d.services || []).map((s) => ({ id: s.id, nom: s.nom, prix: s.prix == null ? null : s.prix, des: !!s.des, devis: !!s.devis })),
        diagnostic: !!d.diagnostic,
        photos: d.photos || [],
        note: d.note || '',
        depot: d.depot || null,
        client: { prenom: (d.client && d.client.prenom) || '', tel: (d.client && d.client.tel) || '', email: (d.client && d.client.email) || '' },
        estimation: d.estimation || null,
        pret: d.pret || null,
        statut: comptoir ? 'recue' : 'envoyee',
        historique: [{ statut: 'envoyee', date: maintenant() }].concat(comptoir ? [{ statut: 'recue', date: maintenant() }] : []),
        origine: comptoir ? 'comptoir' : 'appli',
      };
      if (distant.actif() && !comptoir) {
        try {
          const n = await distant.envoyer(cmd);
          if (n) cmd.num = n;
          cmd.envoye = true;
        } catch (e) {
          cmd.envoye = false; // gardé ici ; on pourra réessayer (et le client a toujours le téléphone)
        }
      }
      if (!comptoir) CO.store.set(MIENNES, [...new Set(mesNums().concat(cmd.num))]);
      const a = lire();
      a.push(cmd);
      ecrire(a);
      return cmd;
    },

    /** l'atelier fait avancer (ou corrige) une commande */
    maj(num, patch) {
      const a = lire();
      const c = a.find((x) => x.num === num);
      if (!c) return null;
      if (patch.statut && patch.statut !== c.statut) {
        c.historique = (c.historique || []).filter((h) => ORDRE.indexOf(h.statut) < ORDRE.indexOf(patch.statut));
        c.historique.push({ statut: patch.statut, date: maintenant() });
      }
      Object.assign(c, patch);
      ecrire(a);
      return c;
    },

    /** le client annule une demande pas encore déposée */
    annuler(num) {
      ecrire(lire().filter((c) => !(c.num === num && c.statut === 'envoyee')));
      CO.store.set(MIENNES, mesNums().filter((n) => n !== num));
    },
    /** ranger un ticket rendu (il disparaît de « Mes tickets », reste dans le carnet de l'atelier) */
    ranger(num) {
      CO.store.set(MIENNES, mesNums().filter((n) => n !== num));
      CO.emit('commandes', lire());
    },
    /** suivre un ticket papier (numéro donné au comptoir) */
    async suivre(num, tel) {
      num = String(num).replace(/\D/g, '').padStart(4, '0');
      if (distant.actif()) {
        try { return await distant.suivre(num, tel); } catch (e) { return null; }
      }
      const c = this.get(num);
      if (c) CO.store.set(MIENNES, [...new Set(mesNums().concat(c.num))]);
      CO.emit('commandes', lire());
      return c;
    },

    /** le total estimé : { min, max, devis } (les « dès » et « sur devis » ouvrent la fourchette) */
    estimer(services) {
      let min = 0, devis = false, ouvert = false;
      services.forEach((s) => {
        if (s.prix == null) { devis = true; return; }
        min += s.prix;
        if (s.des || s.devis) ouvert = true;
      });
      return { min, ouvert, devis };
    },
    /** « 45 € », « dès 75 € », « sur devis » */
    texteEstimation(e) {
      if (!e) return '';
      if (!e.min && e.devis) return 'sur devis';
      return (e.ouvert || e.devis ? 'dès ' : '') + CO.prix(e.min);
    },
    /** le délai le plus long des services choisis (jours ouvrés) */
    delai(services) {
      return services.reduce((m, s) => Math.max(m, (CO.service(s.id) || {}).delai || 0), 0);
    },

    /** des exemples pour la démonstration de l'espace atelier */
    exemples() {
      const now = new Date();
      const iso = (k, h = 10) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - k, h, 20).toISOString();
      const ex = [
        { objet: 'sneakers', objetNom: 'Sneakers', detail: 'Jordan 1 blanches, pointure 43', services: ['desoxydation'], client: { prenom: 'Yanis', tel: '06 12 34 56 78' }, statut: 'etabli', k: 3 },
        { objet: 'talons', objetNom: 'Escarpins & talons', detail: 'Escarpins noirs', services: ['bouts-talons'], client: { prenom: 'Camille', tel: '06 98 76 54 32' }, statut: 'prete', k: 1 },
        { objet: 'ville', objetNom: 'Chaussures de ville', detail: 'Derby cuir marron', services: ['patins-talons'], client: { prenom: 'Marc', tel: '07 11 22 33 44' }, statut: 'recue', k: 1 },
        { objet: 'bottes', objetNom: 'Bottes & boots', detail: 'Dr. Martens 1460', services: ['ressemelage-gomme'], client: { prenom: 'Léa', tel: '06 55 44 33 22' }, statut: 'envoyee', k: 0 },
      ];
      const a = lire();
      ex.forEach((e) => {
        const services = e.services.map((id) => CO.service(id)).filter(Boolean).map((s) => ({ id: s.id, nom: s.nom, prix: s.prix == null ? null : s.prix, des: !!s.des, devis: !!s.devis }));
        const r = ORDRE.indexOf(e.statut);
        a.push({
          num: prochainNumero(), cree: iso(e.k), exemple: true,
          objet: e.objet, objetNom: e.objetNom, detail: e.detail, services, diagnostic: false, photos: [], note: '',
          depot: null, client: e.client, estimation: this.estimer(services), pret: null, statut: e.statut,
          historique: ORDRE.slice(0, r + 1).map((s, i) => ({ statut: s, date: iso(Math.max(0, e.k - i * 0.3), 10 + i) })), origine: 'appli',
        });
      });
      ecrire(a);
    },
    effacerExemples() {
      ecrire(lire().filter((c) => !c.exemple));
    },
  };

  // un autre onglet (l'espace atelier ouvert à côté) a changé le carnet
  window.addEventListener('storage', (e) => {
    if (e.key === 'co:' + CLE || e.key === 'co:' + MIENNES) CO.emit('commandes', lire());
  });
})();
