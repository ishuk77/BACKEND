# AVEC Microcredit (Web + PWA)

Ce projet est une application complète de microcrédit pour les groupes AVEC (Association Villageoise d'Épargne et de Crédit), avec trois niveaux d'accès distincts et une gestion centralisée des comptes Momo.

## Nouveau parcours membre plateforme

Avant de créer, demander à rejoindre ou accepter l’invitation d’un groupe AVEC, chaque personne crée puis active un **compte membre plateforme** dans `platform.html`. L’inscription gratuite exige prénom, nom, e-mail, téléphone, pays et PIN choisi de **4 chiffres**, confirmé une fois à l’inscription. L’e-mail est vérifié par OTP avant l’activation; le téléphone est réservé aux opérations sensibles. Seul le hash du PIN est conservé; le PIN n’est jamais inclus dans les chats ou notifications. Les anciens membres sont automatiquement reliés à un compte actif au démarrage, sans modifier les groupes, rôles, soldes ni historiques existants; leur hash de PIN existant est conservé afin que la connexion historique et la connexion plateforme ouvrent le même espace membre.

`platform.html` est l’entrée membre canonique. Après connexion, **Mes groupes** affiche les groupes actifs et le bouton **Ouvrir le tableau de bord du groupe** crée une session limitée au groupe choisi. Chaque adhésion ouvre un espace membre AVEC distinct, y compris pour le président : son wallet personnel AVEC est alimenté depuis son wallet plateforme, puis sert aux cotisations, remboursements et retraits. Le wallet AVEC collectif porte le nom du groupe et reste séparé. Le président, vice-président et comptable disposent en plus de l’espace **Gérer le compte AVEC** pour le registre collectif, les demandes de crédit, le cycle et les règles de gestion. L’ancien formulaire de `index.html` est seulement une entrée de compatibilité : il ouvre le même portail; quitter un tableau de bord de groupe revient au portail. `admin.html` reste séparé et réservé à l’administration plateforme.

### OTP e-mail et téléphone

L’e-mail active le compte et sert à la récupération du PIN. Le téléphone est vérifié seulement avant la création d’un groupe, un changement de numéro ou une opération financière sensible. Les livraisons OTP sont explicitement en **SANDBOX** par défaut : aucun e-mail, SMS ni WhatsApp réel n’est envoyé sans fournisseur configuré, et les codes ne sont jamais exposés dans une réponse non authentifiée.

Pour envoyer réellement les OTP e-mail, configurez uniquement chez l’hébergeur `EMAIL_OTP_PROVIDER=http`, `EMAIL_OTP_ENDPOINT` (URL HTTPS du fournisseur), `EMAIL_OTP_API_KEY` et `EMAIL_OTP_FROM` (adresse expéditrice valide). L’adaptateur envoie un `POST` JSON avec `from`, `to`, `subject`, `text` et `purpose`, et un en-tête `Authorization: Bearer <EMAIL_OTP_API_KEY>` : choisissez un fournisseur HTTP qui accepte ce contrat ou placez un relais serveur compatible devant lui. Sans ces quatre variables valides, l’application reste en mode sans livraison e-mail et l’interface l’indique; elle ne prétend pas avoir envoyé de message et ne renvoie jamais un OTP par API. Pour la vérification téléphone, conservez un fournisseur interchangeable via `PHONE_OTP_CHANNEL` (`sms` ou `whatsapp`) et les identifiants propres au fournisseur. Ne placez jamais ces secrets dans le dépôt, le navigateur ou un journal.

La création d’un groupe applique des règles serveur configurables : 20 à 50 membres déclarés, capital minimum de 100 USD et frais plateforme de 1 USD par membre. Les frais sont débités uniquement du portefeuille personnel et enregistrés comme revenu plateforme; ils ne sont jamais retirés du fonds du groupe.

Après création réussie, la session membre du président est enregistrée et redirigée vers `index.html`, le tableau de bord du groupe créé; il peut ensuite revenir à l’espace membre canonique.

L’espace membre sépare explicitement le **portefeuille interne AVEC (SANDBOX)** du **portefeuille Momo affiché (SANDBOX)**. Aucun solde Momo n’est réel et aucune route ne contacte un opérateur. Les transferts entre membres du portefeuille interne sont atomiques, idempotents et inscrits en double écriture append-only, uniquement dans la devise commune des deux portefeuilles. Il inclut profil et photo protégée, découverte selon la visibilité choisie, connexions, messages directs réservés aux contacts, fil social avec images, agenda social et notifications. Les administrateurs modèrent uniquement les publications signalées: les messages privés ne sont jamais visibles en administration.

Les images de profil et du fil sont limitées à 3 Mo, contrôlées par type et signature, renommées aléatoirement et accessibles seulement par une route authentifiée. En hébergement, conservez `uploads/` sur un volume privé, persistant et sauvegardé; ne le publiez jamais comme dossier statique.

### Ledger et transferts internes

`POST /api/platform/wallet/transfers` transfère le portefeuille interne entre deux identifiants de membres. Il exige `recipient_identifier`, `amount`, `currency` et un en-tête `Idempotency-Key`. Le débit, le crédit et les deux écritures du journal sont validés dans une seule transaction. `GET /api/platform/wallet/transfers` fournit l’historique du membre, `GET /api/platform/wallet/summary` ses totaux, et `GET /api/platform/notifications/stream` diffuse les nouvelles notifications persistées par SSE avec l’authentification habituelle.

`GET /api/admin/financial-report` fournit aux administrateurs plateforme les indicateurs financiers et risque consolidés. Les montants Momo restent SANDBOX : ce rapport ne constitue ni une réconciliation opérateur ni un relevé bancaire.

## Actualités & publicités publiques

`index.html` intègre les derniers éléments approuvés et renvoie vers `news.html`, le fil public complet avec filtres et pagination. Les annonces et publicités plateforme sont créées, modifiées, planifiées, désactivées ou archivées depuis **Actualités & publicités** dans `admin.html`; chaque action est ajoutée à un journal d’audit immuable. Les textes sont rendus comme du texte brut, jamais comme du HTML.

Une publication de membre ne rejoint ce fil que lorsque son auteur choisit explicitement l’audience **Public AVEC** *et* que la modération est `approved`. Les publications réservées aux contacts, privées, en attente d’examen et retirées sont systématiquement exclues. Le fil ne renvoie aucun téléphone, identité, portefeuille ou autre donnée sensible ; le nom d’auteur n’est montré que si son profil est public. Les images publiques d’annonce sont limitées à 3 Mo et validées par type et signature.

Depuis **Publier du contenu public** dans `platform.html`, un membre dispose de formulaires distincts pour un post, une annonce avec pièce jointe facultative et une publicité produit/service (jusqu’à quatre photos, coordonnées validées côté serveur). Les tarifs déterministes SANDBOX sont affichés avant validation. Un portefeuille interne suffisamment approvisionné est débité immédiatement **uniquement en SANDBOX**; Momo crée seulement un intent SANDBOX et le membre doit déclencher la confirmation simulée. Aucun paiement Momo réel n’est tenté : une confirmation de production nécessiterait un webhook officiel du fournisseur. Les reçus, écritures de répartition et audits sont append-only et les clés `Idempotency-Key` sont obligatoires.

## 👥 Rôles et fonctionnalités

### 🔧 Administrateur de la plateforme
- **Accès global** : Voir tous les groupes et membres
- **Gestion des comptes Momo** : Ajouter/supprimer des comptes Momo par pays et opérateur
- **Révision des groupes bloqués** : Traiter les demandes du président et réactiver après examen
- **Messagerie privée** : Échanger avec le président de chaque groupe, sans exposer la conversation aux autres membres
- **Pas de modification directe** des données (sauf blocage)

### 👨‍💼 Personnel de groupe (Président/Vice-président/Secrétaire/Comptable)
- **Gestion des membres** : rechercher un compte plateforme actif, envoyer une invitation ou admettre une demande; aucune création de profil brut n’est disponible
- **Fonctions élues** : président·e, vice-président·e, secrétaire et comptable sont attribués uniquement par un vote plénier. Une candidature doit obtenir la majorité absolue de tous les membres actifs (pas seulement des suffrages exprimés).
- **Gestion du cycle** : Définir la durée, clôturer/distribuer
- **Suivi des contributions** : Voir les statistiques du groupe
- **Accès complet** aux données du groupe

### 👤 Membre ordinaire
- **Suivi personnel** : Contributions, crédits, retraits
- **Actions financières** : Contribuer, demander crédit, rembourser
- **Signalement** : Alerte en cas de fraude (bloque automatiquement le groupe)

## ✅ Fonctionnalités implémentées

### 🏠 Interface utilisateur
- **Page d'accueil** avec choix : Créer groupe / Se connecter
- **Interface admin séparée** : `admin.html` pour l'administration de la plateforme
- **Visibilité conditionnelle** : Éléments affichés seulement quand nécessaire
- **Création de groupe** : Pays africain, opérateur et portefeuille Momo du groupe validés ensemble
- **Liste des membres** : Visible après connexion au groupe

### 💰 Système Momo intégré
- **Comptes centraux** : Un compte Momo par couple pays/opérateur pour encaisser les recharges
- **Pays et opérateurs** : Liste unique des pays africains couverts par Airtel, MTN, Orange ou Vodacom
- **Gestion admin** : Interface pour ajouter/supprimer des comptes Momo

### 🔐 Sécurité et authentification
- **Authentification** : Téléphone + PIN (4 chiffres)
- **Rôles stricts** : Contrôle d'accès basé sur les permissions
- **Chiffrement** : Mots de passe hashés avec bcrypt

### 📊 Gestion financière
- **Cycle de cotisation** : Distribution automatique (commission 1% plateforme)
- **Limite retraits** : 2 retraits Momo maximum par jour
- **Suivi historique** : Toutes les transactions enregistrées
- **Alertes automatiques** : Un signalement bloque le groupe, est historisé et notifie tous ses membres; seule la plateforme le réactive

## 🚀 Lancer l'application

```bash
cd c:\Users\MB\Desktop\backend
npm install
set JWT_SECRET=replace-with-a-long-random-secret
npm start
```

Ouvrez ensuite dans votre navigateur :
```
http://localhost:3000
```

### Interface d'administration de la plateforme
Accédez à l'interface d'administration séparée :
```
http://localhost:3000/admin.html
```

**Note** : L'interface admin est complètement séparée de l'interface publique pour des raisons de sécurité.

### Déploiement sécurisé (administrateur plateforme)

Après la connexion à `admin.html`, ouvrez **Paramètres de déploiement**. Cette page conserve uniquement les métadonnées non secrètes (URL publique, origines frontend, étiquettes de fournisseurs, URLs TURN sans identifiants, état de maintenance et checklist). Chaque modification est historisée.

**Ne saisissez jamais de clés API, jetons, mots de passe, secrets webhook ou identifiants TURN dans l’application.** Configurez-les exclusivement dans le gestionnaire de variables d’environnement de l’hébergeur, sans les mettre dans le dépôt, la base de données, les journaux ou le navigateur.

Les indicateurs de l’administration vérifient seulement la présence des variables, jamais leurs valeurs. Préparez au minimum :

```text
JWT_SECRET
DATABASE_URL (PostgreSQL de production) ou DATABASE_PATH (SQLite local uniquement)
CORS_ORIGIN
UPLOADS_DIRECTORY ou STORAGE_BUCKET
SMS_PROVIDER=africastalking, SMS_USERNAME=sandbox, SMS_API_KEY
PAYMENT_PROVIDER_<PROVIDER>_CLIENT_SECRET
PAYMENT_WEBHOOK_SECRET_<PROVIDER>
TURN_USERNAME, TURN_CREDENTIAL
VIDEO_PROVIDER_SECRET
```

Utilisez une URL publique HTTPS et des origines CORS HTTPS. Configurez un volume privé, persistant et sauvegardé pour les téléversements. Les URLs TURN non secrètes peuvent être documentées dans l’administration, mais les identifiants TURN doivent rester dans `TURN_USERNAME` et `TURN_CREDENTIAL`. Les appels WebRTC exigent aussi une signalisation autorisée, STUN/TURN et une revue de confidentialité.

Les SMS, paiements Momo et vidéo ne sont pas activés par cette configuration : l’application reste en **SANDBOX** tant qu’un adaptateur officiellement validé, un contrat fournisseur, des tests et une revue sécurité ne sont pas réalisés. Vérifiez régulièrement qu’une sauvegarde peut être restaurée avant de déclarer la production prête.

### Publication Facebook / Meta Page sur Render

La publication Meta est **manuelle et réservée à l’administrateur plateforme**. L’administration affiche uniquement l’état non secret de l’intégration et permet de sélectionner explicitement une actualité plateforme active ou un contenu public déjà approuvé (ou un post de test). Aucun contenu membre n’est envoyé automatiquement, et aucun secret n’est renvoyé au navigateur.

Dans le tableau de bord Render, ajoutez les variables d’environnement suivantes, sans placer leurs valeurs dans le dépôt, la base de données ou les journaux :

```text
META_APP_ID
META_APP_SECRET
META_PAGE_ID
META_PAGE_ACCESS_TOKEN
META_REDIRECT_URI
```

`META_REDIRECT_URI` est facultative seulement si elle correspond à la valeur par défaut `https://www.avec.my/auth/meta/callback`. Dans Meta for Developers, enregistrez exactement cette URL dans **Valid OAuth Redirect URIs** et configurez l’URL de désautorisation `https://www.avec.my/auth/meta/deauthorize`. L’application valide que toute URL de redirection est HTTPS et utilise le chemin `/auth/meta/callback`.

Pour générer manuellement le jeton de Page, utilisez un administrateur de la Page dans l’outil officiel Meta (Graph API Explorer ou le flux OAuth de l’application), accordez uniquement les permissions nécessaires à la gestion/publication de la Page, sélectionnez la Page concernée, puis obtenez un **Page Access Token** durable selon la procédure Meta en vigueur. Enregistrez-le uniquement comme `META_PAGE_ACCESS_TOKEN` dans Render et planifiez son renouvellement avant expiration. Ne copiez jamais ce jeton dans le frontend, des tests, un fichier `.env` versionné ou une capture d’écran. Vérifiez ensuite l’intégration avec le post de test explicite dans `admin.html`.

### PostgreSQL sur Render

Lorsque `DATABASE_URL` est définie, le serveur utilise exclusivement PostgreSQL; `DATABASE_PATH` est alors ignorée. Au démarrage, les migrations versionnées de `migrations/` sont protégées par un verrou PostgreSQL et appliquées avant que le serveur n’accepte du trafic. Ne placez jamais l’URL, son mot de passe ou une copie de ses valeurs dans le dépôt, les journaux ou les paramètres enregistrés par l’application.

Pour une base Render neuve, définissez `DATABASE_URL` et `JWT_SECRET` dans le tableau de bord Render, puis déployez normalement. Pour déplacer les données d’une base SQLite existante :

1. Arrêtez l’ancienne application et sauvegardez séparément la base SQLite et le répertoire privé `uploads/`.
2. Installez les dépendances, définissez `DATABASE_URL` uniquement dans votre environnement de terminal, puis exécutez `npm run migrate:sqlite-to-postgres -- <chemin-vers-la-base-sqlite>`.
3. Le script ouvre SQLite en lecture seule, refuse une cible PostgreSQL non vide, vérifie les clés étrangères, copie les données dans une transaction et réaligne les séquences d’identifiants. Il ne copie pas les fichiers d’`uploads/`; restaurez-les dans un volume privé séparé.
4. Vérifiez les comptes, soldes et fichiers restaurés avant de diriger le trafic vers Render. Conservez SQLite comme sauvegarde jusqu’à validation de la restauration.

La source SQLite doit avoir été démarrée une fois avec cette version de l’application afin que ses migrations locales historiques soient appliquées avant l’export. Pour les tests et le développement local, laissez `DATABASE_URL` non définie et utilisez `DATABASE_PATH`.

## 📱 Installation PWA

### Sur mobile (Android/iOS)
1. Ouvrez `http://localhost:3000` dans Chrome (Android) ou Safari (iOS)
2. **Android** : Menu → "Ajouter à l'écran d'accueil"
3. **iOS** : Menu → "Sur l'écran d'accueil"

### Application native avec Capacitor

Pour créer un APK Android ou une app iOS :

```bash
# Installer Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android --save

# Initialiser
npx cap init "AVEC Microcredit" "com.avec.microcredit"

# Ajouter Android
npx cap add android

# Synchroniser et ouvrir
npx cap sync android
npx cap open android
```

## 🗄️ Base de données

Le projet utilise **PostgreSQL** quand `DATABASE_URL` est défini; SQLite reste disponible pour le développement local et les tests via `DATABASE_PATH`. Les deux schémas couvrent les tables suivantes :

- `groups` : Groupes AVEC (nom, pays, wallet, statut blocage)
- `members` : Membres (profil, rôle, soldes, historique)
- `platform_momo` : Comptes Momo centraux par pays et opérateur
- `fraud_reports` et `review_requests` : Signalements et demandes de réactivation
- `chat_messages` : Chat de groupe et conversations privées classées `platform_president` entre la plateforme et le président
- `message_reactions`, `chat_attachments` : Réactions et métadonnées des pièces jointes du chat
- `meetings`, `meeting_invites` : Calendrier de groupe et réponses aux invitations
- `history` : Historique des transactions

## 🤝 Suite de collaboration AVEC

La suite locale ajoute au chat : profils avec identifiant AVEC et disponibilité persistante (en ligne, occupé·e, hors ligne), indicateurs de présence, liste des membres, réactions emoji, calendrier et invitations. Les présidents, secrétaires et comptables peuvent planifier une réunion pour des membres de leur groupe. Les ressources de collaboration sont vérifiées par groupe côté serveur.

### Pièces jointes locales

Les documents, images et vidéos sont enregistrés dans `uploads/`, créé au démarrage et exclu du service de fichiers publics. Seuls les membres autorisés du groupe peuvent les télécharger via une route authentifiée. Les fichiers sont limités à 6 Mo, à une liste de types autorisés et à des noms générés aléatoirement ; les noms d’origine restent uniquement des métadonnées SQLite. En production, configurez un volume persistant, privé et sauvegardé pour `uploads/` (ou remplacez cette couche par un stockage objet avec URLs signées). Ne montez jamais ce dossier comme répertoire statique public.

### Appels et visioconférences : prérequis d’hébergement

Les boutons d’appel audio, vidéo et de visio de groupe sont volontairement des **indications de configuration** : aucun média n’est envoyé et aucun appel ne fonctionne en local. Avant de les activer en production, fournissez :

1. Une signalisation WebRTC authentifiée et autorisée par groupe (WebSocket ou fournisseur validé).
2. Des serveurs STUN/TURN, avec identifiants courts générés côté serveur et journalisation minimale.
3. HTTPS, politiques CSP/permissions caméra-micro et une revue de sécurité/confidentialité.
4. Pour des appels de groupe robustes, un SFU ou un fournisseur de conférence officiellement intégré, ses secrets hors du dépôt et des tests de capacité.

Ne déclarez pas la communication audio/vidéo disponible avant ces éléments. Les réunions, invitations et présences locales restent utilisables sans fournisseur média.

## � Fonctionnement offline et GSM

### 🔌 Mode offline
L'application fonctionne comme une **PWA (Progressive Web App)** :
- **Interface accessible** : L'interface utilisateur fonctionne sans connexion
- **Cache automatique** : Les assets statiques sont mis en cache
- **Limitations** : Les données dynamiques nécessitent une connexion internet

### 📱 Utilisation GSM uniquement
- **Non supporté nativement** : L'application nécessite internet pour les données
- **Solution alternative** : Utiliser un hotspot mobile ou WiFi communautaire
- **Amélioration future** : Intégration SMS API pour transactions hors ligne

### 💡 Recommandations
- **Connexion minimale** : 2G suffit pour les transactions de base
- **Synchronisation** : Les données sont synchronisées automatiquement
- **Cache intelligent** : L'app se souvient de votre session
- **Base de données** : PostgreSQL en production, SQLite3 en local
- **Authentification** : JWT + bcrypt
- **PWA** : Service Worker + Web App Manifest
- **Mobile** : Capacitor (optionnel)

## 📋 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/refresh` - Rafraîchir token
- `POST /api/platform/phone-verifications/request`, `POST /api/platform/phone-verifications/verify` - vérification de téléphone SANDBOX liée à la session navigateur
- `POST /api/platform/auth/register` - inscription plateforme (identité/passeport, téléphone vérifié et PIN à 4 chiffres confirmé)
- `PUT /api/platform/profile/security` - finalisation sécurisée identité/PIN/téléphone pour les comptes existants incomplets
- `POST /api/platform-admin` - Initialiser l'administrateur de plateforme (une seule fois)

### Groupes
- `GET /api/groups` - Liste des groupes (admin plateforme)
- `POST /api/groups` - Créer un groupe et son président
- `GET /api/groups/:id` - Détails d'un groupe

### Membres
- `GET /api/members/:groupId` - Membres d'un groupe
- `POST /api/members` - Retiré (`410`) : les créations directes de profils sont interdites
- `PUT /api/members/:id` - Modifier membre

### Adhésions et gouvernance de groupe
- `GET/POST /api/groups/:groupId/account-search|invitations` — rechercher un compte plateforme actif et envoyer une invitation d’adhésion
- `GET/PUT /api/groups/:groupId/join-requests...` — consulter puis admettre/refuser une demande
- `GET/POST /api/groups/:groupId/elections` — consulter ou proposer une élection avec candidatures
- `POST /api/groups/:groupId/elections/:electionId/votes` — une voix par membre actif
- `POST /api/groups/:groupId/elections/:electionId/close` — clôture par le personnel actif; calcule le seuil côté serveur et applique la fonction seulement en cas de majorité absolue

Les fonctions existantes sont conservées comme titulaires **bootstrap** pendant la migration. Le premier président créé avec un groupe est également bootstrap transitoire; toute fonction issue d’un vote est marquée comme telle dans la liste des membres. Les élections, votes et clôtures sont historisés et les membres actifs reçoivent une notification.

### Comptes Momo
- `GET /api/momo` - Liste des comptes Momo
- `POST /api/momo` - Ajouter compte Momo
- `DELETE /api/momo/:id` - Supprimer compte Momo
- `GET /api/countries` - Pays et opérateurs Momo pris en charge

### Fraude et réactivation
- `POST /api/members/:memberId/fraud-reports` - Signaler une fraude et bloquer le groupe
- `POST /api/groups/:groupId/review-requests` - Demande de révision (président du groupe bloqué)
- `GET /api/blocked-groups`, `GET /api/review-requests` - Vue plateforme des dossiers à traiter
- `POST /api/groups/:groupId/reactivate` - Réactiver un groupe (plateforme uniquement)

### Messagerie privée plateforme / président
- `GET /api/platform-conversations` - Groupes avec président accessibles à la plateforme
- `GET /api/platform-conversations/:groupId` - Conversation privée (plateforme ou président de ce groupe uniquement)
- `POST /api/platform-conversations/:groupId` - Envoyer un message privé (plateforme ou président de ce groupe uniquement)
- Les notifications de fraude et de réactivation restent dans le chat de groupe et ne sont pas incluses dans cette conversation.

### Collaboration de groupe
- `GET /api/meetings/:groupId`, `POST /api/meetings` — consulter et planifier les réunions (création réservée au personnel du groupe)
- `PUT /api/meetings/:meetingId/invitation` — répondre à son invitation
- `POST /api/collaboration/attachments`, `GET /api/collaboration/attachments/:attachmentId/download` — téléverser/télécharger une pièce jointe autorisée
- `POST/DELETE /api/chat/:groupId/messages/:messageId/reactions...` — ajouter ou retirer une réaction

### Actualités et publicités
- `GET /api/public/news?limit=&offset=&from=YYYY-MM-DD&to=YYYY-MM-DD&type=` — fil public en lecture seule; `type` accepte `announcement`, `advertisement` ou `member_publication`.
- `GET /api/public/news/media/:mediaId`, `GET /api/public/news/social-media/:mediaId` — médias contrôlés des éléments actuellement publics.
- `GET/POST /api/admin/public-content`, `PUT /api/admin/public-content/:contentId`, `POST /api/admin/public-content/:contentId/archive` — gestion réservée à l’administrateur plateforme.
- `POST /api/admin/public-content/media` — image d’annonce validée (JPEG, PNG, GIF ou WebP, 3 Mo maximum), réservée à l’administrateur plateforme.
- `GET /api/admin/meta/status`, `GET /api/admin/meta/publishable-content`, `POST /api/admin/meta/publish` — état non secret, sélection et publication Meta réservés à l’administrateur plateforme; `Idempotency-Key` est obligatoire pour publier.
- `GET /auth/meta/start`, `GET /auth/meta/callback`, `POST /auth/meta/deauthorize` — flux OAuth/désautorisation Meta. Le démarrage exige un bearer token d’administrateur plateforme; le callback n’expose aucun jeton.
- `GET /api/member-content/prices` — table de prix déterministe SANDBOX pour les contenus membres.
- `POST /api/member-content` — crée un post, une annonce ou une publicité membre payante; `Idempotency-Key` obligatoire. Le portefeuille interne est le seul débit immédiat et reste SANDBOX.
- `POST /api/member-content/payments/:paymentId/simulate-confirmation` — confirme explicitement un intent Momo **SANDBOX**; cette route ne remplace pas un webhook fournisseur réel.
- Les annonces/publicités texte ou photo coûtent exactement **0,25 USD-équivalent SANDBOX**. Une vidéo coûte **0,10 USD-équivalent par Mo entamé et par jour** (minimum un jour). Le portefeuille interne est le seul débit immédiat de démonstration; Momo ne crée qu’un intent SANDBOX en attente, publié après confirmation simulée.
- Un commentaire sur une publication publique coûte exactement **0,25 USD-équivalent SANDBOX**, avec reçu idempotent et répartition **0,125 plateforme / 0,125 auteur**. Les commentaires privés, entre contacts et de groupe ne sont pas facturés.
- `GET /api/public/flashes`, `GET /api/public/social-links` — flashs éditoriaux AVEC filtrables par catégorie/localité et liens officiels. `GET/POST /api/admin/flashes`, `POST /api/admin/flashes/:flashId/archive`, `GET/PUT /api/admin/social-links/:network` sont réservés à la plateforme.

Les flashs sont saisis et contrôlés par l’administration : AVEC ne récupère ni ne reproduit automatiquement de contenu sportif, international ou local de tiers et ne prétend fournir aucun flux en direct. Les liens Facebook, Instagram, YouTube et TikTok sont des liens sortants validés; Meta ne reçoit qu’un contenu explicitement sélectionné par un administrateur autorisé.

### Autres
- `GET /api/stats` - Statistiques
- `GET/POST /api/history` - Historique transactions

### Fondations de paiement (SANDBOX UNIQUEMENT)

Les routes de paiement ne contactent **aucun** opérateur et ne provoquent aucun transfert réel. Elles créent uniquement des écritures de test auditables en unités mineures entières :

- `POST /api/payments/intents` — crée une collecte simulée (`type: "collection"`) ou une demande de décaissement de prêt (`type: "loan_disbursement"`). Un en-tête `Idempotency-Key` est obligatoire.
- `POST /api/payment-operations/:operationId/approve` — président, personnel autorisé ou plateforme uniquement ; le demandeur ne peut jamais approuver son propre prêt.
- `GET /api/payments`, `GET /api/payments/:transactionId`, `GET /api/payment-operations` — suivi de réconciliation SANDBOX selon le rôle et le groupe.
- `POST /api/webhooks/:provider` — réception d'architecture webhook signée, pour `mtn`, `orange`, `airtel` ou `vodacom`. La signature HMAC SHA-256 est attendue dans `X-Payment-Signature` (avec ou sans préfixe `sha256=`). Les identifiants d'événement sont dédupliqués.

Le registre `financial_ledger`, les tentatives et événements de paiement, ainsi que le journal d'audit sont append-only : il n'existe aucune API publique permettant leur édition ou leur suppression. Les références externes commençant par `SANDBOX-` sont simulées et ne sont pas des références opérateur.

## Configuration future des opérateurs — ne pas activer sans contrat

Cette version reste **strictement SANDBOX** même si des variables sont présentes. Elle n'implémente volontairement ni URL ni appel API d'un opérateur. Utilisez uniquement les variables d'environnement du système (aucune dépendance `dotenv` n'est requise) :

```text
# Secrets webhook utilisés par l'architecture de test/reception signée
PAYMENT_WEBHOOK_SECRET_MTN
PAYMENT_WEBHOOK_SECRET_ORANGE
PAYMENT_WEBHOOK_SECRET_AIRTEL
PAYMENT_WEBHOOK_SECRET_VODACOM

# Noms réservés pour une future intégration officiellement validée (non lus par le SANDBOX)
PAYMENT_PROVIDER_MTN_CLIENT_ID
PAYMENT_PROVIDER_MTN_CLIENT_SECRET
PAYMENT_PROVIDER_MTN_MERCHANT_ID
PAYMENT_PROVIDER_ORANGE_CLIENT_ID
PAYMENT_PROVIDER_ORANGE_CLIENT_SECRET
PAYMENT_PROVIDER_ORANGE_MERCHANT_ID
PAYMENT_PROVIDER_AIRTEL_CLIENT_ID
PAYMENT_PROVIDER_AIRTEL_CLIENT_SECRET
PAYMENT_PROVIDER_AIRTEL_MERCHANT_ID
PAYMENT_PROVIDER_VODACOM_CLIENT_ID
PAYMENT_PROVIDER_VODACOM_CLIENT_SECRET
PAYMENT_PROVIDER_VODACOM_MERCHANT_ID
```

Sans `PAYMENT_WEBHOOK_SECRET_<PROVIDER>`, le webhook correspondant est refusé ; une signature invalide est toujours refusée. Ne mettez jamais ces secrets dans le dépôt, les journaux ou le navigateur.

### Checklist avant toute intégration réelle

1. Obtenir un contrat marchand, des identifiants et la documentation officielle à jour de chaque opérateur/pays.
2. Confirmer les pays, devises, numéros et flux collecte/décaissement avec l'opérateur ; ne pas déduire d'URL ou de protocole.
3. Faire réaliser une revue de sécurité (gestion de secrets, signatures, idempotence, autorisations et rapprochement comptable).
4. Implémenter puis tester l'adaptateur certifié de chaque opérateur dans un environnement officiel de test.
5. Obtenir une validation métier, juridique et sécurité écrite avant de remplacer le simulateur SANDBOX.

**Avertissement : aucun déploiement ne doit être considéré prêt pour les paiements réels tant qu'un contrat opérateur officiel, des identifiants officiels et une revue de sécurité n'ont pas été obtenus.**

## 🎯 Utilisation typique

1. **Créer admin plateforme** (une seule fois)
2. **Ajouter comptes Momo** pour les pays supportés
3. **Créer un groupe AVEC** avec le président
4. **Ajouter des membres** via l'admin groupe
5. **Gérer le cycle** de cotisation
6. **Suivre les transactions** et intervenir si nécessaire

## 🔒 Sécurité

- Chiffrement des mots de passe
- Tokens JWT avec expiration
- Contrôle d'accès par rôle
- Validation des données
- Protection contre les injections SQL

---

**Développé pour les communautés AVEC - Afrique Centrale**
