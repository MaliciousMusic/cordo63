/* ==========================================================================
   Cordo 63 — LA source : la boutique, les horaires, les services et leurs prix,
   les étapes d'une commande, l'histoire de Clément, la FAQ.
   Tout ce que l'appli affiche vient d'ici (le HTML statique d'index.html, le JSON-LD
   et llms.txt en sont une copie pour Google et les IA : `node tools/build-pages.mjs`).
   Sources : Instagram @cordo.63 et @tiega49, fiche Google, La Montagne (22/08/2023),
   registre des entreprises. Voir osint/00-SYNTHESE.md.
   ⚠ Les PRIX et les DÉLAIS sont une grille type de la maquette : à valider avec Clément.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});

  CO.SHOP = {
    nom: 'Cordo 63',
    marque: 'CORDO63',
    accroche: 'Cordonnerie · Maroquinerie · Clés',
    artisan: 'Clément Petit',
    prenom: 'Clément',
    adresse: '6 rue Verdier-Latour',
    cp: '63000',
    ville: 'Clermont-Ferrand',
    repere: 'place du Mazet, en plein centre',
    tel: '04 73 24 66 90',
    telIntl: '+33473246690',
    email: null, // à demander : sert aux commandes par e-mail et au formulaire de secours
    sms: null, // un mobile pour prévenir les clients (le 04 ne reçoit pas de SMS) : à demander
    instagram: 'https://www.instagram.com/cordo.63/',
    instagramPerso: 'https://www.instagram.com/tiega49/',
    custom: 'https://www.instagram.com/small.custom/',
    facebook: 'https://www.facebook.com/moncordonnierclermontois/',
    geo: { lat: 45.7793649, lng: 3.0852253 },
    maps: 'https://www.google.com/maps/place/Cordo+63/@45.7793649,3.0852253,17z/data=!4m6!3m5!1s0x47f71be79d50fe19:0xa56cab6b6912c1d6!8m2!3d45.7793649!4d3.0852253',
    itineraire: 'https://www.google.com/maps/dir/?api=1&destination=Cordo%2063%2C%206%20rue%20Verdier-Latour%2C%2063000%20Clermont-Ferrand',
    avis: {
      note: 4.9, nombre: 122, source: 'Google', releve: 'septembre 2026',
      url: 'https://www.google.com/maps/place/Cordo+63/@45.7793649,3.0852253,17z/data=!4m8!3m7!1s0x47f71be79d50fe19:0xa56cab6b6912c1d6!8m2!3d45.7793649!4d3.0852253!9m1!1b1',
    },
    depuis: 2023, // reprise en juin 2023 (la cordonnerie du Mazet existait avant, chez Christophe Giraud)
    societe: { raison: 'CORDO 63', forme: 'SARL', siren: '953 162 203', siret: '953 162 203 00012', naf: '95.23Z', creation: '2023-06-15' },
    paiements: ['CB', 'Apple Pay', 'Espèces', 'Chèque', 'PayPal', 'Paylib'],
  };

  /* ---------- Horaires (heure de Paris). Par jour : liste de plages [ouverture, fermeture] en minutes.
     Bio Instagram = Google = PagesJaunes (sept. 2026) : mardi → samedi, 10h–13h30 / 14h30–19h. */
  const h = (a, b) => [Math.round(a * 60), Math.round(b * 60)];
  const JOUR = [h(10, 13.5), h(14.5, 19)];
  CO.HOURS = {
    semaine: [null, null, JOUR, JOUR, JOUR, JOUR, JOUR], // Date.getDay : 0 = dimanche
    fermetures: [], // congés : [{ du: '2026-12-24', au: '2027-01-02', motif: 'Fêtes' }]
  };
  CO.JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  CO.JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  CO.MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /* ---------- Ce qu'on apporte (le premier choix d'une commande) ---------- */
  CO.OBJETS = [
    { id: 'sneakers', nom: 'Sneakers', icone: 'i-sneaker' },
    { id: 'ville', nom: 'Chaussures de ville', icone: 'i-derby' },
    { id: 'bottes', nom: 'Bottes & boots', icone: 'i-botte' },
    { id: 'talons', nom: 'Escarpins & talons', icone: 'i-escarpin' },
    { id: 'sandales', nom: 'Sandales & mules', icone: 'i-sandale' },
    { id: 'maroquinerie', nom: 'Sac, ceinture, cuir', icone: 'i-sac' },
    { id: 'cles', nom: 'Clés & badges', icone: 'i-cle' },
    { id: 'autre', nom: 'Autre chose', icone: 'i-autre' },
  ];
  const CHAUSSURES = ['sneakers', 'ville', 'bottes', 'talons', 'sandales'];

  /* ---------- Les services (grille type, À CONFIRMER). prix : € ; des : « dès » ; devis : sur devis.
     delai : jours ouvrés (0 = pendant qu'on attend) ; objets : pour quoi on le propose ;
     outils : ce qui se pose sur l'établi quand on le choisit (ids de CO.Outils). */
  CO.SERVICES = [
    {
      id: 'talons', titre: 'Talons & patins', outils: ['talons', 'patins'], items: [
        { id: 'bouts-talons', nom: 'Bouts de talons', desc: 'Escarpins, bottines : les embouts changés, la paire.', prix: 14, delai: 0, objets: ['talons', 'bottes', 'ville'] },
        { id: 'talons-homme', nom: 'Talons homme', desc: 'Gomme ou cuir et gomme, la paire.', prix: 22, delai: 1, objets: ['ville', 'bottes'] },
        { id: 'patins', nom: 'Patins antidérapants', desc: 'Protègent la semelle cuir et ne glissent plus, la paire.', prix: 22, delai: 1, objets: ['ville', 'talons', 'bottes'] },
        { id: 'patins-talons', nom: 'Patins + talons', desc: 'Le duo qui fait durer une paire neuve.', prix: 38, delai: 1, objets: ['ville', 'talons', 'bottes'] },
      ],
    },
    {
      id: 'semelles', titre: 'Ressemelage', outils: ['semelle-cuir', 'tranchet'], items: [
        { id: 'demi-semelle', nom: 'Demi-semelle cuir', desc: 'L’avant de la semelle refait, cousu ou collé.', prix: 45, delai: 5, objets: ['ville', 'talons', 'bottes'] },
        { id: 'ressemelage-cuir', nom: 'Ressemelage complet cuir', desc: 'Semelle et talon neufs, bords teintés et lustrés.', prix: 85, delai: 7, objets: ['ville', 'bottes'] },
        { id: 'ressemelage-gomme', nom: 'Ressemelage gomme crantée', desc: 'Boots, chaussures de marche, Dr. Martens.', prix: 75, des: true, delai: 7, objets: ['bottes', 'ville'] },
        { id: 'birkenstock', nom: 'Semelle Birkenstock d’origine', desc: 'Liège et semelle refaits avec les pièces de la marque.', prix: 65, delai: 7, objets: ['sandales'] },
      ],
    },
    {
      id: 'sneakers', titre: 'Sneakers', outils: ['sneaker', 'brosse'], items: [
        { id: 'nettoyage', nom: 'Nettoyage complet', desc: 'Dessus, semelle, lacets et intérieur, à la main.', prix: 25, delai: 3, objets: ['sneakers'] },
        { id: 'desoxydation', nom: 'Nettoyage + semelles blanchies', desc: 'On enlève le jaune des semelles et des bords.', prix: 45, delai: 5, objets: ['sneakers'] },
        { id: 'recollage-sneakers', nom: 'Semelle recollée', desc: 'Décollée à l’avant ou sur le côté : nettoyée, recollée, pressée.', prix: 20, delai: 2, objets: ['sneakers'] },
        { id: 'talon-interieur', nom: 'Doublure de talon refaite', desc: 'Le trou derrière le talon, réparé en cuir ou en daim.', prix: 30, delai: 5, objets: ['sneakers'] },
        { id: 'restauration', nom: 'Restauration complète', desc: 'Retouches de couleur, couture, semelle : on en parle d’abord.', prix: 80, des: true, devis: true, delai: 10, objets: ['sneakers'] },
        { id: 'custom', nom: 'Custom', desc: 'Peinture, cuir, pièces rapportées : le côté Small Custom de Clément.', devis: true, delai: 15, objets: ['sneakers'] },
      ],
    },
    {
      id: 'couture', titre: 'Couture & recollage', outils: ['alene', 'fil', 'pot-colle'], items: [
        { id: 'recollage', nom: 'Recollage', desc: 'Semelle, bout, talon qui baille, la paire.', prix: 12, delai: 1, objets: CHAUSSURES },
        { id: 'couture', nom: 'Reprise de couture', desc: 'Une couture qui lâche, à la machine ou à la main.', prix: 10, des: true, delai: 2, objets: [...CHAUSSURES, 'maroquinerie'] },
        { id: 'elastiques', nom: 'Élastiques & soufflets', desc: 'Chelsea, mocassins : élastiques neufs.', prix: 18, delai: 3, objets: ['bottes', 'ville'] },
      ],
    },
    {
      id: 'soin', titre: 'Cirage, teinture & soin', outils: ['creme', 'chiffon'], items: [
        { id: 'cirage', nom: 'Cirage & glaçage', desc: 'Crème, cire, brosse : la paire qui brille.', prix: 10, delai: 0, objets: ['ville', 'bottes', 'talons'] },
        { id: 'renovation', nom: 'Rénovation cuir', desc: 'Nettoyée, nourrie, les éraflures reprises.', prix: 20, delai: 3, objets: ['ville', 'bottes', 'talons', 'maroquinerie'] },
        { id: 'teinture', nom: 'Teinture cuir ou daim', desc: 'Raviver ou changer de couleur.', prix: 45, des: true, delai: 7, objets: [...CHAUSSURES, 'maroquinerie'] },
        { id: 'impermeable', nom: 'Imperméabilisation', desc: 'Contre la pluie et les taches.', prix: 8, delai: 0, objets: [...CHAUSSURES, 'maroquinerie'] },
      ],
    },
    {
      id: 'maroquinerie', titre: 'Maroquinerie', outils: ['fermeture'], items: [
        { id: 'zip-bottes', nom: 'Fermeture éclair de botte', desc: 'Changée sur toute la hauteur.', prix: 35, delai: 5, objets: ['bottes'] },
        { id: 'zip-sac', nom: 'Fermeture de sac ou de blouson', desc: 'Remplacée à l’identique.', prix: 30, des: true, delai: 5, objets: ['maroquinerie'] },
        { id: 'anse', nom: 'Anse ou poignée', desc: 'Recousue ou refaite en cuir.', prix: 25, des: true, delai: 5, objets: ['maroquinerie'] },
        { id: 'ceinture', nom: 'Ceinture raccourcie ou trous', desc: 'Pendant qu’on attend.', prix: 5, delai: 0, objets: ['maroquinerie'] },
        { id: 'pressions', nom: 'Pressions, œillets, rivets', desc: 'Posés ou remplacés.', prix: 5, des: true, delai: 0, objets: ['maroquinerie', 'sneakers', 'bottes'] },
      ],
    },
    {
      id: 'cles', titre: 'Clés', outils: ['cles'], items: [
        { id: 'cle-plate', nom: 'Double de clé plate', desc: 'Taillée pendant qu’on attend.', prix: 4, delai: 0, objets: ['cles'] },
        { id: 'cle-securite', nom: 'Clé de sécurité', desc: 'Clés à gorges, à pompe, brevetées (avec la carte).', prix: 12, des: true, delai: 0, objets: ['cles'] },
        { id: 'badge', nom: 'Badge ou bip d’immeuble', desc: 'Copié sur place selon le modèle.', prix: 20, delai: 0, objets: ['cles'] },
      ],
    },
    {
      id: 'boutique', titre: 'Pour vos paires', outils: ['lacets'], items: [
        { id: 'lacets', nom: 'Lacets', desc: 'Plats, ronds, cirés : toutes les longueurs.', prix: 3, des: true, delai: 0, objets: CHAUSSURES },
        { id: 'semelles-int', nom: 'Semelles intérieures', desc: 'Cuir, confort, laine.', prix: 12, des: true, delai: 0, objets: CHAUSSURES },
        { id: 'kit-sneakers', nom: 'Kit d’entretien sneakers', desc: 'Nettoyant, brosse, chiffon.', prix: 19, delai: 0, objets: ['sneakers'] },
        { id: 'embauchoirs', nom: 'Embauchoirs en cèdre', desc: 'La forme gardée, l’humidité bue.', prix: 25, delai: 0, objets: ['ville', 'bottes'] },
      ],
    },
  ];
  CO.TARIFS_INDICATIFS = true; // la maquette affiche « tarifs indicatifs, devis gratuit en boutique »

  // index : id → { item, rubrique }
  CO.service = (() => {
    const m = new Map();
    CO.SERVICES.forEach((r) => r.items.forEach((it) => m.set(it.id, Object.assign({ rubrique: r.id }, it))));
    return (id) => m.get(id) || null;
  })();

  /* ---------- Une commande, étape par étape (le ticket jaune) ---------- */
  CO.STATUTS = [
    { id: 'envoyee', nom: 'Envoyée', court: 'Envoyée', texte: 'Clément a votre demande. Déposez votre paire à la boutique.' },
    { id: 'recue', nom: 'Déposée', court: 'Déposée', texte: 'Votre paire est à l’atelier, le ticket est accroché.' },
    { id: 'etabli', nom: 'À l’établi', court: 'Établi', texte: 'Clément est dessus.' },
    { id: 'finitions', nom: 'Finitions', court: 'Finitions', texte: 'Ponçage, teinture, cirage : les derniers détails.' },
    { id: 'prete', nom: 'Prête !', court: 'Prête', texte: 'Venez la chercher avec votre ticket.' },
    { id: 'rendue', nom: 'Rendue', court: 'Rendue', texte: 'Bonne route ! Revenez quand vous voulez.' },
  ];

  /* ---------- Carte fidélité (la carte à clous) ---------- */
  CO.FIDELITE = {
    objectif: 10, // 10 réparations = 1 nettoyage sneakers ou 1 cirage offert (règle de la maquette, à valider)
    cadeau: 'un nettoyage de sneakers ou un cirage offert',
  };

  /* ---------- L'histoire (La Montagne, 22 août 2023 ; Instagram) ---------- */
  CO.HISTOIRE = [
    { titre: 'Des baskets avant tout', texte: 'Clément Petit aime les sneakers au point d’avoir voulu les réparer et les customiser lui-même. À un peu plus de trente ans, il quitte son job et part en CAP cordonnier.' },
    { titre: 'Le Mazet', texte: 'Christophe Giraud, cordonnier de la place du Mazet depuis quinze ans, est le seul à le prendre en apprentissage. Quand il décide d’arrêter, en 2023, il lui propose la boutique. « J’ai pensé oui, alors j’ai dit oui. »' },
    { titre: 'Je suis ma vitrine', texte: 'Clément rénove et inverse l’atelier et la boutique : il travaille maintenant derrière la vitrine, pour qu’on le voie faire. Talons, semelles, sneakers, sacs, clés, et ses customs sous le nom de Small Custom.' },
  ];

  /* ---------- Le process : ce qui se passe entre le dépôt et le retrait ---------- */
  CO.PROCESS = [
    { id: 'discuter', titre: 'On en parle', texte: 'Vous montrez, il regarde, il explique ce qui est possible et combien ça coûte. Le devis est gratuit.' },
    { id: 'ticket', titre: 'Le ticket jaune', texte: 'Un numéro, deux moitiés : l’une reste accrochée à votre paire, l’autre part avec vous (et dans l’appli).' },
    { id: 'demonter', titre: 'Démonter', texte: 'Semelle usée décollée, vieille colle poncée, coutures ouvertes : on repart propre.' },
    { id: 'reparer', titre: 'Réparer', texte: 'Coupe au tranchet, colle, forme, marteau, couture. À la main, avec les machines de l’atelier.' },
    { id: 'finir', titre: 'Finir', texte: 'Bords fraisés et teintés à la finisseuse, cuir nourri, brossé, ciré.' },
    { id: 'rendre', titre: 'Prête', texte: 'Un message quand c’est prêt. Vous passez avec votre ticket, on vérifie ensemble.' },
  ];

  /* ---------- Ce que disent les clients (Google, relevé sept. 2026 ; prénoms abrégés) ---------- */
  CO.AVIS = [
    { qui: 'Enora M.', quand: 'juillet 2026', texte: 'Artisan compétent et consciencieux. Des patins posés rapidement et de manière très qualitative. En bonus, la bonne humeur et une touche d’humour.' },
    { qui: 'Noemi G.', quand: 'août 2026', texte: 'Mes Birkenstock ont été restaurées avec le plus grand soin, ressemelées avec la semelle d’origine. Tout ça dans la bonne humeur.' },
    { qui: 'Laure D.', quand: 'juin 2026', texte: 'Un double de clés, un accueil chaleureux, des clés qui marchent très bien et une rapidité rare.' },
  ];

  /* ---------- Questions fréquentes (réponses à valider avec Clément) ; moi = la même réponse dans sa bouche (les bulles) ---------- */
  CO.FAQ = [
    { q: 'Faut-il prendre rendez-vous ?', r: 'Non : passez aux heures d’ouverture, du mardi au samedi de 10h à 13h30 et de 14h30 à 19h. Vous pouvez aussi préparer votre dépôt dans l’appli : Clément reçoit votre demande et votre ticket est prêt.', moi: 'Non : passez quand c’est ouvert, du mardi au samedi, 10h–13h30 et 14h30–19h. Ou préparez votre dépôt dans l’appli : je reçois votre demande, et votre ticket est prêt.' },
    { q: 'Combien de temps pour une réparation ?', r: 'Talons, cirage, clés : souvent pendant qu’on attend. Patins, recollage : un à deux jours. Ressemelage, nettoyage de sneakers : trois jours à une semaine. Restauration et custom : on en parle ensemble.' },
    { q: 'Réparez-vous les sneakers ?', r: 'Oui, c’est la passion de Clément : nettoyage à la main, semelles blanchies, semelles recollées, doublure de talon refaite, restauration complète et custom.', moi: 'Oui, c’est ma passion ! Nettoyage à la main, semelles blanchies, semelles recollées, doublure de talon refaite, restauration complète, et du custom.' },
    { q: 'Comment savoir si ma paire est prête ?', r: 'Avec le numéro de votre ticket jaune, dans l’onglet Mes tickets de l’appli. Clément vous prévient aussi par message quand elle est prête.', moi: 'Avec le numéro de votre ticket jaune, dans l’onglet Mes tickets. Et je vous envoie un message quand elle est prête.' },
    { q: 'Faites-vous les doubles de clés ?', r: 'Oui : clés plates, clés de sécurité (avec la carte de propriété), badges et bips d’immeuble.' },
    { q: 'Quels moyens de paiement ?', r: 'Carte bancaire, Apple Pay, espèces, chèque, PayPal et Paylib.' },
    { q: 'Où êtes-vous ?', r: '6 rue Verdier-Latour, place du Mazet, en plein centre de Clermont-Ferrand. L’atelier est derrière la vitrine : on voit Clément travailler depuis la rue.', moi: '6 rue Verdier-Latour, place du Mazet, en plein centre de Clermont. L’atelier est derrière la vitrine : vous me verrez travailler depuis la rue.' },
  ];

  /* ---------- Utilitaires horaires ---------- */
  const fmtH = (m) => {
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
  };
  CO.fmtH = fmtH;
  CO.fmtPlages = (pl) => (pl ? pl.map((p) => fmtH(p[0]) + '–' + fmtH(p[1])).join(' · ') : 'fermé');
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  CO.iso = iso;
  const fermeLe = (d) => CO.HOURS.fermetures.some((f) => iso(d) >= f.du && iso(d) <= f.au);
  CO.plagesDu = (d) => (!fermeLe(d) && CO.HOURS.semaine[d.getDay()]) || null;

  /** Le statut maintenant (heure de Paris) : { ouvert, pause, jusqua, prochain, texte, court } */
  CO.statut = function (now = CO.parisNow()) {
    try { if (new URLSearchParams(location.search).has('ouvert')) return { ouvert: true, jusqua: 19 * 60, texte: 'Ouvert · jusqu’à 19h', court: 'Ouvert' }; } catch (e) { /* hors navigateur */ }
    const min = now.getHours() * 60 + now.getMinutes();
    const pl = CO.plagesDu(now);
    if (pl) {
      for (const p of pl) {
        if (min >= p[0] && min < p[1]) {
          const bientot = p[1] - min <= 30;
          return { ouvert: true, bientot, jusqua: p[1], texte: (bientot ? 'Ferme bientôt · ' : 'Ouvert · jusqu’à ') + fmtH(p[1]), court: 'Ouvert' };
        }
      }
      const suite = pl.find((p) => p[0] > min);
      if (suite) {
        const pause = min >= pl[0][1];
        return { ouvert: false, pause, prochain: { dansJours: 0, heure: suite[0] }, texte: (pause ? 'Pause déjeuner · réouvre à ' : 'Fermé · ouvre à ') + fmtH(suite[0]), court: pause ? 'Pause' : 'Fermé' };
      }
    }
    for (let k = 1; k < 21; k++) {
      const d = new Date(now.getTime() + k * 86400000);
      const p = CO.plagesDu(d);
      if (!p) continue;
      const quand = k === 1 ? 'demain à ' + fmtH(p[0][0]) : CO.JOURS[d.getDay()] + ' à ' + fmtH(p[0][0]);
      return { ouvert: false, prochain: { dansJours: k, jour: d.getDay(), heure: p[0][0] }, texte: 'Fermé · ouvre ' + quand, court: 'Fermé' };
    }
    return { ouvert: false, texte: 'Fermé', court: 'Fermé' };
  };

  /** Les n prochains jours d'ouverture (pour choisir quand on dépose) : [{ date, iso, label, plages }] */
  CO.joursOuverts = function (n = 6, now = CO.parisNow()) {
    const out = [];
    const min = now.getHours() * 60 + now.getMinutes();
    for (let k = 0; k < 30 && out.length < n; k++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
      const pl = CO.plagesDu(d);
      if (!pl) continue;
      if (k === 0 && min >= pl[pl.length - 1][1] - 20) continue; // trop tard aujourd'hui
      const label = k === 0 ? 'Aujourd’hui' : k === 1 ? 'Demain' : CO.JOURS_COURTS[d.getDay()] + ' ' + d.getDate();
      out.push({ date: d, iso: iso(d), label, plages: pl, auj: k === 0 });
    }
    return out;
  };

  /** n jours d'ouverture après une date (le délai d'une réparation) → Date */
  CO.apresJoursOuvres = function (depart, n) {
    let d = new Date(depart.getFullYear(), depart.getMonth(), depart.getDate());
    if (n <= 0) return d;
    let k = 0;
    while (k < n) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (CO.plagesDu(d)) k++;
    }
    return d;
  };
  CO.fmtDate = (d, avecJour = true) => (avecJour ? CO.JOURS[d.getDay()] + ' ' : '') + d.getDate() + ' ' + CO.MOIS[d.getMonth()];

  /** Un délai en jours ouvrés, en mots (même texte que la grille statique de tools/build-pages.mjs) */
  CO.delaiTexte = (d) => (d === 0 ? 'pendant qu’on attend' : d === 1 ? '24 h' : d <= 2 ? '48 h' : d <= 5 ? d + ' jours' : d <= 7 ? 'une semaine' : d <= 10 ? 'deux semaines' : 'sur rendez-vous');

  /** Prix : 14 → « 14 € » ; 4,5 → « 4,50 € » ; { des } → « dès 75 € » ; { devis } → « sur devis » */
  CO.prix = (n) => (Number.isInteger(n) ? n + ' €' : n.toFixed(2).replace('.', ',') + ' €');
  CO.prixService = (it) => (it.prix == null ? 'sur devis' : (it.des ? 'dès ' : '') + CO.prix(it.prix));
})();
