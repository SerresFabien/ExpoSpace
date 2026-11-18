# ExpoSpace

**Créez votre exposition et faites-la visiter en 3D, directement dans le navigateur.**

ExpoSpace permet à chacun de monter une galerie virtuelle avec ses propres images : on importe ses œuvres, on les
accroche aux murs d'une ou plusieurs salles, on choisit les couleurs, on publie. N'importe qui peut ensuite s'y
promener en 3D, au clavier et à la souris, ou parcourir les œuvres dans une galerie 2D accessible.

- Site en ligne : **https://expospace.by-h.me**
- Projet étudiant de Fabien, Léna, Antoine et Hugo (2026)

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Technologies utilisées](#technologies-utilisées)
3. [Le temps réel et la particularité des WebSockets](#le-temps-réel-et-la-particularité-des-websockets)
4. [Manuel d'utilisation](#manuel-dutilisation)
5. [Installation locale](#installation-locale)
6. [Commandes utiles](#commandes-utiles)
7. [Organisation du code](#organisation-du-code)

---

## Fonctionnalités

### Pour tout le monde, sans compte

- **Catalogue** des expositions publiées, avec couverture, auteur, nombre d'œuvres et date de publication.
- **Recherche** par titre (insensible à la casse et aux accents : « lumieres » trouve « Lumières du Sud »).
- **Compteur en direct** « N personnes en visite » sur chaque exposition.
- **Visite 3D** : déplacement libre dans des salles de 12 × 10 m, collisions avec les murs, tableaux à taille réelle.
- **Fiche de chaque œuvre** (titre, auteur, description) en cliquant sur un tableau.
- **Portes entre les salles**, avec le nom de la salle qui se trouve derrière ; un clic pour passer de l'autre côté.
- **Galerie 2D accessible** (clavier, lecteur d'écran) ; elle sert aussi de solution de repli quand l'appareil ne
  gère pas la 3D (WebGL).

### Avec un compte

- **Inscription en quelques secondes**, sans adresse e-mail : un identifiant, un nom affiché, un mot de passe.
  Un **code de récupération** est donné une seule fois pour retrouver le compte en cas d'oubli du mot de passe.
- **Studio** pour créer jusqu'à 10 expositions :
  - **import d'images** JPEG, PNG ou WebP (plusieurs à la fois, avec barre de progression), réduites
    automatiquement et converties en WebP ;
  - **fiches d'œuvres** : titre, auteur, description et texte alternatif ;
  - **jusqu'à 3 salles** par exposition, chacune avec **12 emplacements** répartis sur les quatre murs ;
  - **accrochage sur un plan** : on clique sur un emplacement, on choisit l'œuvre ou une porte ;
  - **portes libres** : posées comme des tableaux, sur n'importe quel emplacement, vers n'importe quelle autre salle ;
  - **6 couleurs de murs** : blanc cassé, gris perle, vert sauge, bleu nuit, terracotta, anthracite ;
  - **aperçu** en 3D et en 2D avant publication ;
  - **publication en un clic**, une fois les conditions remplies (titre, couverture, au moins une œuvre complète par
    salle, toutes les salles accessibles par des portes depuis la première). Pour modifier une exposition publiée,
    on la dépublie, puis on la republie : son lien ne change pas.
- **Discussion en direct** dans chaque salle pendant la visite (messages éphémères, jamais enregistrés).
- **Mon compte** : changer de nom affiché ou de mot de passe.

### Pour les administrateurs

- **Modération** : masquer ou rétablir une exposition publiée.
- **Gestion des comptes** : suspendre un compte (il est déconnecté aussitôt et son contenu public disparaît).

### Sécurité et robustesse

- Mots de passe hachés avec **Argon2id**, sessions stockées en base, jeton **CSRF**, en-têtes **Helmet**,
  limitation du nombre de tentatives.
- Les images ne sont jamais servies comme de simples fichiers : chaque demande passe par l'API, qui vérifie les droits.
- Deux onglets qui modifient la même exposition ne s'écrasent pas : le second est prévenu que l'exposition a changé
  (contrôle de version **ETag / If-Match**).
- Quotas : 36 œuvres par exposition, 8 Mo par image, 250 Mo par compte.

---

## Technologies utilisées

JavaScript (modules ES) de bout en bout, sans TypeScript, sans Docker et sans Redis.

| Couche | Technologies |
| --- | --- |
| Interface | **React 19**, React Router 7, **Vite 8**, CSS simple (sans framework) |
| 3D | **Three.js** 0.186 et **React Three Fiber** 9, chargés seulement à l'entrée de la visite |
| Serveur | **Node.js 24+**, **Express 5**, express-session, Helmet, Zod (validation) |
| Base de données | **MariaDB 10.11** et **Prisma 7** (adaptateur `@prisma/adapter-mariadb`, migrations versionnées) |
| Images | Multer (réception des fichiers), **Sharp** (contrôle, redimensionnement, conversion WebP) |
| Sécurité | Argon2 (mots de passe), CSRF maison, limitation de fréquence en mémoire |
| Temps réel | **express-x** 4 (`@jcbuisson/express-x`, la bibliothèque du cours) sur **Socket.IO 4.8** |
| Tests | **Vitest** (unitaires), **Supertest** (API sur une vraie base MariaDB), **Playwright** (parcours dans un vrai navigateur) |
| Qualité | ESLint |
| Hébergement | **By-Hoster** (Plesk, Phusion Passenger), certificat Let's Encrypt |

Le projet est un **monorepo npm** : l'API (`apps/api`), l'interface (`apps/web`) et du code partagé entre les deux
(`packages/shared` : géométrie de la salle, limites, règles de publication).

---

## Le temps réel et la particularité des WebSockets

### Ce que fait le temps réel

Pendant une visite, chaque salle affiche **le nombre de visiteurs présents** et une **discussion** :

- tout le monde lit les messages, mais seuls les **comptes connectés** peuvent écrire ;
- les messages sont **éphémères** : rien n'est enregistré en base, ils disparaissent quand on quitte la salle ;
- un message n'atteint que les personnes **de la même salle** ;
- le catalogue affiche aussi, pour chaque exposition, le nombre de personnes en train de la visiter.

### Comment c'est construit

Le serveur utilise **express-x**, la bibliothèque du cours, qui ajoute Socket.IO à Express. Notre API Express
habituelle est montée à l'intérieur de l'application express-x : un seul serveur HTTP répond à la fois aux pages,
à l'API et au temps réel (chemin `/api/realtime/`).

- Service `presence` : rejoindre ou quitter une salle. Chaque salle est un **canal** (`room:<id>`) et chaque
  exposition aussi (`expo:<id>`, pour le compteur du catalogue).
- Service `chat` : un hook `before` vérifie que l'auteur est connecté et que son compte n'est pas suspendu, puis le
  message est publié uniquement sur le canal de sa salle.
- À la connexion, le serveur relit le **cookie de session** de l'utilisateur, refuse les **origines étrangères** et
  limite les envois (10 messages par 30 secondes). En cas de refus, il renvoie un message simple, jamais la pile
  d'erreur du serveur.

### La particularité : l'hébergeur bloque les WebSockets

Normalement, Socket.IO ouvre une connexion **WebSocket** : la connexion HTTP est « transformée » (en-tête `Upgrade`)
en un canal permanent dans les deux sens. Chez By-Hoster, le serveur **nginx** de Plesk, placé devant notre
application, **supprime cet en-tête `Upgrade`** : la demande de WebSocket est refusée (erreur 400), et le réglage qui
le permettrait n'est pas accessible avec notre offre.

Notre solution :

1. **Le client commence en « polling » HTTP** (`transports: ['polling', 'websocket']`) : il envoie des requêtes HTTP
   ordinaires, dont l'une reste en attente jusqu'à ce que le serveur ait quelque chose à transmettre. Le résultat est le
   même pour l'utilisateur : présence et messages arrivent en direct. Si un jour l'hébergeur laisse passer les WebSockets,
   Socket.IO bascule tout seul sur le WebSocket.
2. Les requêtes de polling n'envoient pas toujours l'en-tête `Origin`. Le serveur les accepte alors seulement si le
   navigateur indique qu'elles viennent du même site (`Sec-Fetch-Site: same-origin`), pour garder la protection contre
   les autres sites.
3. **Le temps réel est facultatif** : si la connexion échoue malgré tout, la page affiche « Discussion indisponible »
   au bout de quelques secondes et la visite fonctionne normalement.
4. Les canaux sont gardés **en mémoire** (pas de Redis) : l'application doit tourner dans **un seul processus**,
   ce qui est le cas sur notre hébergement.

---

## Manuel d'utilisation

### Visiter une exposition (sans compte)

1. Ouvrez **https://expospace.by-h.me** : le catalogue s'affiche. Tapez un titre dans « Rechercher par titre » si besoin.
2. Cliquez sur une exposition, puis sur **« Visiter en 3D »** (ou **« Galerie 2D »**).
3. Dans la salle :

   | Action | Commande |
   | --- | --- |
   | Avancer / reculer | **↑ / ↓**, ou **Z / S** (W / S sur un clavier QWERTY) |
   | Pas de côté | **Q / D** (A / D en QWERTY) |
   | Tourner | **← / →** |
   | Regarder avec la souris | cliquer dans la salle ; **Échap** libère la souris |
   | Voir la fiche d'une œuvre | cliquer sur le tableau |
   | Changer de salle | cliquer sur une porte, ou « Salle précédente » / « Salle suivante » |
   | Aller de tableau en tableau | bouton **« Œuvre suivante »** (pratique sur téléphone) |
   | Revenir au centre | bouton **« Recentrer »** |

4. En haut à droite, le compteur indique combien de personnes sont dans la salle ; **« Discussion »** ouvre le tchat.

### Créer son compte

1. Cliquez sur **« Créer un compte »**.
2. Choisissez un **identifiant** (3 à 30 caractères : minuscules, chiffres, `_`), un **nom affiché** (visible sur vos
   expositions) et un **mot de passe** d'au moins 12 caractères.
3. Notez le **code de récupération** affiché à la fin : il ne sera plus jamais montré. C'est le seul moyen de
   retrouver votre compte si vous oubliez votre mot de passe (lien « Mot de passe oublié » de la page de connexion).

### Créer et publier une exposition

1. Dans **« Mes expositions »**, donnez un titre et cliquez sur **« Créer l’exposition »** : le studio s'ouvre, avec
   une première salle.
2. Onglet **Œuvres** : cochez la case des droits sur les images, cliquez sur **« Choisir des images… »** et
   sélectionnez vos fichiers. Complétez ensuite chaque fiche avec **« Modifier la fiche »** (titre, auteur,
   description, texte alternatif).
3. Onglet **Salle et accrochage** :
   - cliquez sur un emplacement du plan, choisissez une œuvre, puis **« Placer ici »** ;
   - choisissez la **couleur des murs** puis **« Enregistrer la salle »** ;
   - **« Ajouter une salle »** (3 au maximum) ; pour relier deux salles, choisissez **« Une porte »** sur un
     emplacement et la salle où elle mène ;
   - cliquez sur **« Enregistrer la disposition »**.
4. Onglet **Informations** : description et **couverture** (l'image affichée dans le catalogue).
5. Vérifiez le résultat avec l'**aperçu** 3D ou 2D.
6. Onglet **Publication** : la liste indique ce qui manque éventuellement. Quand tout est prêt, cliquez sur
   **« Publier l’exposition »** : elle apparaît au catalogue et se visite sans compte.
7. Pour la modifier ensuite : **dépubliez-la** dans l'onglet Publication, faites vos changements, puis republiez.

### Administrer (comptes administrateurs)

Le rôle administrateur se donne sur le serveur avec `npm run admin:promote -- <identifiant>`. La page
**Administration** permet ensuite de **masquer / rétablir** une exposition et de **suspendre / rétablir** un compte.

---

## Installation locale

Prérequis : **Node.js 24 ou plus** et npm. Aucun Docker ni droit administrateur n'est nécessaire.

```bash
npm ci                     # dépendances exactes
cp .env.example .env       # puis renseigner SEED_PASSWORD
npm run db:start           # dans un terminal dédié : MariaDB 10.11 local (port 33306), téléchargé au premier lancement
npm run db:generate        # client Prisma
npm run db:deploy          # migrations
npm run db:seed            # comptes de démonstration « camille » et « noah » (mot de passe : SEED_PASSWORD)
npm run dev                # API + interface sur http://localhost:5173
```

Avec un MariaDB déjà installé sur la machine : créer l'utilisateur `expospace` et les bases `expospace`,
`expospace_test` et `expospace_shadow` (encodage `utf8mb4`), puis mettre le port `3306` dans les URL du `.env`.

---

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'API et l'interface en mode développement |
| `npm run build` / `npm start` | Construit l'interface / lance l'application comme en production |
| `npm run db:start` / `db:stop` | Démarre / arrête le MariaDB local |
| `npm run db:deploy` / `db:status` | Applique les migrations / affiche leur état |
| `npm run db:migrate` | Crée une migration après une modification de `schema.prisma` |
| `npm run db:check` | Diagnostic : base, migrations, dossiers, modules |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires et tests de l'API (base `expospace_test`) |
| `npm run test:e2e` | Parcours Playwright dans un vrai navigateur (`npx playwright install chromium` la première fois) |
| `npm run release` | Construit l'archive à déposer sur l'hébergement |
| `npm run backup` / `restore -- <archive>` | Sauvegarde / restauration de la base et des images |
| `npm run admin:promote -- <id>` | Donne le rôle administrateur à un compte |

---

## Organisation du code

```
apps/api/            API Express : routes, services, middlewares, temps réel (realtime.js)
apps/api/prisma/     schéma de la base et migrations
apps/api/test/       tests d'intégration de l'API
apps/web/            interface React : pages, studio, visite 3D, galerie 2D
packages/shared/     code commun : géométrie de la salle, limites, règles de publication
scripts/             base locale, migrations, démonstration, sauvegarde, livraison, administration
tests/               tests unitaires et parcours Playwright
deploy/              page d'attente et modèle de configuration de production
app.cjs              point d'entrée sur l'hébergement (Phusion Passenger)
```

Les données sont dans MariaDB (comptes, expositions, salles, portes, œuvres, sessions). Les images sont stockées sur
disque hors du dossier public, sous des noms aléatoires, et ne sont servies que par l'API.
