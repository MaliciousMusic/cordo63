# Cordo 63 — maquette du site-appli

Le site de la cordonnerie de **Clément Petit**, place du Mazet à Clermont-Ferrand, pensé comme une petite appli de téléphone : un écran, des onglets en bas, pas de long défilement. HTML/CSS/JS sans framework ni build : ça s'ouvre tel quel et s'héberge n'importe où.

**L'idée** : Clément a inversé l'atelier et la boutique « avec l'ambition que l'on me voie travailler. Je suis ma vitrine » (La Montagne, 2023). Le site fait pareil : lui et son process au cœur, et une vraie prise de commande (le ticket jaune).

Direction artistique, tirée de leur identité réelle :
- **le logo CORDO63** (grotesque très large et fine, vert sauge #8A927B sur crème #FFF2E2), reconstruit en tracés d'après leur avatar Instagram (`tools/logo/`) ; **le logo de l'appli** : CORDO63 en noir sur crème, un lacet rouge qui passe dessus, dessous, entre les lettres (`assets/brand/logo-cordo63-lacet.svg`, les icônes, le favicon « 63 ») ;
- **la devanture** d'après la vue de la rue : l'immeuble d'angle (la rue d'à côté en simple tranche au bord gauche), l'enduit crème, la pierre de Volvic, les volets sauge, le bandeau vert clair aux lettres dorées « CORDONNERIE », et derrière la vitre l'atelier éclairé où Clément travaille ;
- **l'enseigne** : leur Air Jordan 1 sculptée dans le bois, en 3D temps réel. Le cadre d'acier est fixé au bandeau ; la chaussure tourne doucement sur sa broche (un tour en 14 s), et on peut la relancer du doigt ;
- **l'enseigne-soulier** en tête de l'accueil : une derby en tôle peinte sauge bordée d'or, pendue à deux chaînes, OUVERT / FERMÉ / PAUSE ; on la touche, elle déplie les horaires en accordéon ;
- **les lacets** : les accès rapides sous le logo sont des lacets plats tressés, en bandeaux ondulés ; on en touche un, il se tend, file hors de l'écran, puis le lien s'ouvre ;
- **l'établi vu de dessus** comme sur ses photos Instagram : le tapis de découpe vert usé (coupes, colle, teintures) sur l'aggloméré brun, les coins encombrés (pots de colle, fil, tasse, crayons, téléphone…), les outils rangés au cordeau au centre, en rendu réaliste calculé pixel par pixel ;
- **les plans** : chaque réparation du catalogue a son plan bleu (blueprint) animé qui montre ce qu'on fait ;
- **la boutique de l'intérieur** : Clément redessiné d'après ses photos (barbe, lunettes transparentes, tablier en toile, avant-bras tatoué, montre à bracelet orange), au travail à ses machines ;
- **le ticket de réparation jaune à pastille rouge** (on le voit sur ses photos) : c'est la commande, le suivi, le bouton principal ;
- le cuir surpiqué (la barre des onglets, la carte à clous), les étiquettes kraft (les prix).

Couleurs : crème #FFF2E2, papier #F4EBDC, sauge #8A927B / #6E866A / #56705A, encre #2B2420, cuir #4A3122, ticket #F2D24B, pastille #E03A2E, tapis #2E5B4C, plan #1C4E86.

Polices, toutes hébergées sur le site (`tools/fetch-fonts.py`) :
- **Bricolage Grotesque** : les titres (serrée et grasse, comme une étiquette de boîte à sneakers) et le texte ;
- **Big Shoulders** (`--chiffres`) : prix, numéros de ticket, panneaux ;
- **Shantell Sans** (`--main`) : la voix de Clément dans ses bulles ;
- **Covered By Your Grace** (`--stylo`) : son écriture au stylo sur les tickets.

## Lancer en local

```bash
python tools/dev-server.py
```

Puis http://localhost:5193 (serveur sans cache). Un double-clic sur `index.html` marche aussi (sauf les polices, bloquées par Chrome en `file://`).

| Adresse | Effet |
|---|---|
| `?intro` | rejoue l'ouverture (une fois par visite sinon) · `?nointro` la saute |
| `?soir` · `?jour` | force l'éclairage du soir ou du jour (sinon : l'heure de Paris et le coucher du soleil) |
| `?ouvert` | montre la boutique ouverte quel que soit le moment (démo un lundi) |
| `?atelier` | ouvre l'espace atelier (code demandé) |
| `lab/facade.html` | la devanture seule (`?nuit`, `?ferme`, `?fige`, `?zone`, `?entre`, `?ardoise`) |
| `lab/jordan.html` | l'enseigne en 3D seule (`?mode=enseigne|seule`, `?pose=pointe|posee`, `?nuit`, `?fige`, `?angle=`, `?grand`) |
| `lab/logo.html` | le logo au lacet : le mot, l'icône carrée, le signe du favicon |
| `lab/accueil.html` | l'enseigne-soulier et les lacets (`?etat=ouvert|pause|ferme`, `?ouvrir`, `?ralenti=4`, `?reduit`) |
| `lab/etabli.html` | l'établi et tous les outils (`?planche`, `?disposition=services`, `?bench`) |
| `lab/plans.html` | les 33 plans animés (`?planche`, `?grands`, `?seul=id`, `?film=id`, `?fixe`) |
| `lab/boutique.html` | l'intérieur et Clément (`?activite=`, `?soir`, `?portrait`, `?vitesse=4`, `?reduit`) |
| `lab/process.html` | le film des mains sur l'établi |
| `lab/clouage.html` | les mains qui plantent les clous, les têtes de clous |

## Ce qu'il y a dedans

| Onglet | Contenu |
|---|---|
| **Ouverture** | L'écran est tressé de lacets de toutes les couleurs, le logo au lacet rouge au milieu sur une étiquette crème, « Entrer » (le geste qui autorise le son) ou « Entrer sans le son ». Au toucher, les lacets sont tirés hors de l'écran par vagues, sur le beat de l'atelier, chacun avec son zip ; l'étiquette part la dernière et l'appli apparaît. |
| **Accueil** | En tête, l'enseigne-soulier (statut en direct, horaires qui se déplient, elle se balance quand on défile). La devanture vivante, Clément derrière la vitre, l'enseigne Jordan qui tourne. **On pousse la porte** : la caméra cadre la porte, elle s'ouvre (clochette, lumière chaude sur le trottoir) et on entre dans l'atelier. Dessous : le logo, les cinq lacets (Déposer une paire, Les tarifs, Itinéraire, Appeler Clément, Instagram), le ticket en cours s'il y en a un, les plus demandés en étiquettes kraft, le pied de page (espace atelier, mentions légales). |
| **L'établi** | L'écran coupé en deux : en haut, fixe, l'établi vu de dessus avec « L'établi » dans son coin et le devis sur un ticket jaune dans l'autre ; en dessous, la grille des 33 services, chacun avec la vignette de son plan animé (toucher la vignette : le grand plan, sa légende, « Ajouter au devis »). On touche une réparation : la case est percée à l'emporte-pièce, ses outils se posent sur le tapis, le devis se met à jour ; « Déposer ces réparations » prépare le ticket. |
| **Déposer** | Le ticket jaune se remplit étape par étape : quoi, quels travaux, une photo, quand on passe, qui, récapitulatif. « Envoyer à Clément » : le numéro se tamponne en rouge, le ticket se déchire le long des pointillés, la souche file dans Mes tickets. Rien n'est payé en ligne. |
| **Mes tickets** | Le mur de l'atelier : de la pierre sous la lampe, une planche de chêne et sa bande Dymo, et les souches pendues à des crochets par leur œillet (elles se balancent quand on défile ; tampon vert « PRÊTE » quand la paire est prête, gris « RENDUE » ensuite), le QR à montrer au comptoir, une pastille sur l'onglet. On suit un ticket papier en écrivant son numéro sur une souche. En dessous, l'établi : **la carte à clous** posée sur le tapis vert, avec la coupelle de clous et le maillet. **Le compte** : son nom et son téléphone (une étiquette kraft à remplir) ; le nom est alors **cousu** au fil jaune sous CORDO63, point par point, et le téléphone pré-remplit le dépôt. Clément tape son code et ses mains plantent les clous au maillet (4 à 7 coups ; chaque tête différente). Dix clous = un nettoyage de sneakers ou un cirage offert. |
| **L'atelier** | **La boutique vue de l'intérieur** : Clément travaille dans une grande boucle au hasard (finisseuse rouge, pied de fer, presse, machine à coudre, nettoyage de sneakers, machine à clés, pauses), chaque machine avec son bruit. **On le touche** : il pose son outil, se tourne et parle en bulles comme dans un jeu (son histoire, comment ça marche, les horaires en direct, les avis, Small Custom, les questions fréquentes, déposer une paire). « Montrez-moi ! » : la caméra plonge sur son établi et **le film de ses mains** prend le relais, étape par étape. Autour : la radio (le son), le carnet sur le comptoir (l'espace atelier), les étagères (Mes tickets), « La rue » pour ressortir, « Tout lire » pour tout le texte d'un coup (process, histoire, avis, photos, horaires, FAQ). |
| **Espace atelier** | Derrière le code de l'atelier : tous les tickets par état, le détail, les boutons d'état, le prix final, « Prévenir : c'est prêt » (un SMS tout rédigé), et **le ticket au comptoir**. « Montrer avec des exemples » remplit le carnet pour une démonstration. |

**Code de l'atelier de la maquette : 631019** (63, et 10h → 19h), six chiffres. Pour le changer : `node tools/set-pin.mjs 482193` (seule son empreinte SHA-256 est publiée).

```
index.html                tout le contenu (lisible par Google et les IA sans JS) + JSON-LD + icônes au trait (sprite SVG)
css/cordo.css             l'identité : crème, sauge, cuir, ticket jaune, kraft, carte à clous, bulles, atelier
css/co-accueil.css        l'enseigne-soulier et les lacets
css/co-plans.css          la vignette des plans dans le catalogue, la feuille du grand plan
css/co-tickets.css        Mes tickets : le mur, les souches pendues, l'établi de la carte, la fiche
css/co-splash.css         l'ouverture aux lacets
css/fonts.css             polices hébergées (généré par tools/fetch-fonts.py)
js/co-core.js             hasard seedé, bruit, maths, couleurs, SVG, stockage, cadence des animations, sons WebAudio
                          (CO.sfx.ajouter / ajouterVoix : les modules y ajoutent leurs sons)
js/co-data.js             LA source : la boutique, les horaires, les services et prix, les étapes, l'histoire, la FAQ
js/co-brand.js            le logo CORDO63 en tracés, lettre par lettre (généré par tools/logo/build.py)
js/co-facade.js           la devanture (SVG dessiné en JS), la caméra qui entre par la porte
js/co-jordan.js           l'enseigne : l'Air Jordan 1 sculptée dans le bois, en WebGL (modèle et bois procéduraux)
js/co-panneau.js          l'enseigne-soulier : statut, horaires qui se déplient
js/co-lacets.js           les lacets : dessin tressé, tirage hors de l'écran, retour ; le logo au lacet (CO.Lacets.logo)
js/co-rendu.js            la lumière commune des objets vus de dessus (calcul pixel par pixel, cache IndexedDB)
js/co-outils.js           les outils, les pièces et l'encombrement de l'établi
js/co-etabli.js           l'établi : le tapis usé, l'encombrement, la disposition au cordeau, poser / retirer / montrer
js/co-plans.js            les 33 plans animés (vignette et grand plan)
js/co-commandes.js        le carnet de tickets (numéros, états, estimation) ; branchement serveur prévu (CO.BACKEND)
js/co-ticket.js           le ticket jaune : en-tête, souche, détail, QR, tampon, déchirure
js/co-services.js         L'établi : grille, sélection, devis, outils posés, vignettes des plans
js/co-deposer.js          Déposer : le ticket étape par étape, l'envoi
js/co-suivi.js            Mes tickets : souches, avancement, pastille, feuille d'un ticket
js/co-compte.js           le compte (nom, téléphone), la fiche, le nom cousu sous CORDO63
js/co-clous.js            la carte à clous et le code de l'atelier (pavé, SHA-256)
js/co-clouage.js          les mains de Clément qui plantent les clous, les têtes de clous
js/co-pro.js              l'espace atelier de Clément
js/co-mains.js            les mains de Clément vues de dessus (poses, avant-bras, montre)
js/co-process.js          le film du process sur l'établi (36 s en boucle)
js/co-film.js             « Montrez-moi ! » : le film par-dessus l'atelier, la bulle, les étapes
js/co-clement.js          Clément en personne (tête 3D, bras, mains, marche), dessiné au canvas
js/co-boutique-decor.js   le décor de la boutique (mur, machines, comptoir), peint une fois
js/co-boutique.js         la scène de l'atelier : caméra, boucle d'activités, sons, cibles
js/co-dialogue.js         les bulles de Clément et nos réponses
js/co-atelier.js          l'onglet L'atelier : la scène, ses cibles, l'entrée et la sortie
js/co-nous.js             « Tout lire » : volets, pile de photos, étapes
js/co-splash.js           l'ouverture : les lacets qui couvrent l'écran puis s'en vont, sur le beat de l'atelier
js/co-app.js              onglets, feuilles, son, horaires, devanture + enseigne, entrée dans la boutique
tools/build-pages.mjs     HTML statique (services, process, histoire, avis, horaires, FAQ) + JSON-LD + llms.txt + sitemap
tools/logo/               reconstruction du logo (fit.py → geo.py → build.py)
tools/supabase/           le schéma de production du carnet de tickets (RLS, fonction de suivi)
tools/render-assets.mjs   icônes d'appli et image de partage (Chrome sans tête, serveur local lancé)
tools/capture.mjs         capture d'écran d'une page locale
tools/set-pin.mjs         changer le code de l'atelier
tools/set-domain.mjs      mettre le vrai domaine partout
tools/bump.mjs            estampiller CSS et JS avant chaque publication (cache de GitHub Pages)
osint/                    le dossier d'enquête (non publié) : osint/00-SYNTHESE.md
```

Après une modification des services, des horaires ou de la FAQ : `node tools/build-pages.mjs`.
Icônes et image de partage (serveur local lancé) : `node tools/render-assets.mjs`.

## À confirmer avec Clément

- **Les prix et les délais** : la grille est une grille type de cordonnerie (2026), à valider ligne par ligne ; ce qu'il fait ou ne fait pas (clés de voiture, gravure, tampons…), les envois par la poste.
- **Le logo** : reconstruit d'après l'avatar Instagram (150 px) ; demander le fichier source et le nom de la police.
- **Un e-mail et un mobile** : pour recevoir les commandes et envoyer les SMS « c'est prêt » (le 04 73 24 66 90 est un fixe).
- **La carte à clous** : la règle (10 réparations = un nettoyage de sneakers ou un cirage offert) est une proposition.
- **Ses bulles** : ses répliques sont écrites d'après La Montagne (22 août 2023), la fiche Google et Instagram ; à relire avec lui. Les photos Instagram de « Tout lire » : originaux HD et accord.
- **Son portrait** : dessiné d'après une seule photo ; les motifs de ses tatouages sont inventés ; la disposition des machines de l'atelier est une composition d'après les photos, pas le vrai plan.
- **L'enseigne** : c'est une Air Jordan 1 avec le Swoosh ; Nike, Air Jordan et le Swoosh sont des marques de Nike. Le modèle 3D ne porte aucun texte ni le logo « Wings » ; le Swoosh se retire d'une ligne (`SWOOSH = false` en tête de `js/co-jordan.js`) si Clément préfère la prudence.
- **Mentions légales** : capital, TVA, e-mail, hébergeur de production.

## Passer en production : que Clément reçoive vraiment les commandes

Dans la maquette, le carnet de tickets vit dans le téléphone : le client et l'espace atelier lisent le même carnet, ce qui permet de montrer tout le parcours sur un seul appareil. En production :

1. **Base de données** : un projet Supabase (offre gratuite suffisante), le schéma `tools/supabase/schema.sql` (le public ne peut que créer une demande ; le suivi passe par une fonction qui exige le numéro et le téléphone ; Clément se connecte par lien magique pour tout voir).
2. Renseigner `CO.BACKEND = { type: 'supabase', url, cle }` en tête de `js/co-commandes.js` : l'envoi et le suivi passent par le serveur ; l'espace atelier lit le carnet en ligne (à brancher sur l'authentification Supabase).
3. **Prévenir** : une notification à Clément à chaque demande (webhook → e-mail ou SMS), et le SMS « c'est prêt » au client (aujourd'hui rédigé et envoyé depuis son téléphone ; automatisable avec Brevo ou Twilio).
4. **Photos** : un stockage privé (bucket Supabase) plutôt que dans la commande.
5. Hébergement statique (GitHub Pages, Netlify, Cloudflare Pages) sur le domaine choisi ; `node tools/set-domain.mjs https://www.…` ; retirer le `noindex`.

## SEO local et référencement par les IA

En place : JSON-LD `LocalBusiness` (horaires avec la pause de midi, géo, fondateur, catalogue complet des services et prix, action « déposer »), `FAQPage`, `WebSite` ; toute la grille de prix, le process, l'histoire, les avis, les horaires et la FAQ en HTML statique (la feuille « Tout lire ») ; `llms.txt` ; robots.txt ouvert aux robots IA ; géo-balises ; manifeste d'appli.
Hors du site, le plus rentable : renseigner le site sur la fiche Google (elle n'en a pas), le lien en bio Instagram, Apple Business Connect et Bing Places.
