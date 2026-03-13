# AVEC Microcredit (Web + PWA)

Ce projet est une application complète de microcrédit pour les groupes AVEC (Association Villageoise d'Épargne et de Crédit), avec trois niveaux d'accès distincts et une gestion centralisée des comptes Momo.

## 👥 Rôles et fonctionnalités

### 🔧 Administrateur de la plateforme
- **Accès global** : Voir tous les groupes et membres
- **Gestion des comptes Momo** : Ajouter/supprimer des comptes Momo par pays
- **Blocage de groupes** : Intervention sur alertes de fraude
- **Pas de modification directe** des données (sauf blocage)

### 👨‍💼 Administrateur de groupe (Président/Secrétaire/Comptable)
- **Gestion des membres** : Ajouter de nouveaux membres
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
- **Création de groupe** : Formulaire géographique avec pays filtrés par comptes Momo
- **Liste des membres** : Visible après connexion au groupe

### 💰 Système Momo intégré
- **Comptes centraux** : Un compte Momo par pays pour encaisser les recharges
- **Filtrage des pays** : Seuls les pays avec compte Momo apparaissent dans la liste
- **Gestion admin** : Interface pour ajouter/supprimer des comptes Momo

### 🔐 Sécurité et authentification
- **Authentification** : Téléphone + PIN (4 chiffres)
- **Rôles stricts** : Contrôle d'accès basé sur les permissions
- **Chiffrement** : Mots de passe hashés avec bcrypt

### 📊 Gestion financière
- **Cycle de cotisation** : Distribution automatique (commission 1% plateforme)
- **Limite retraits** : 2 retraits Momo maximum par jour
- **Suivi historique** : Toutes les transactions enregistrées
- **Alertes automatiques** : Rappels de paiement, blocage sur fraude

## 🚀 Lancer l'application

```bash
cd c:\Users\MB\Desktop\backend
npm install
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

Le projet utilise **SQLite** avec les tables suivantes :

- `groups` : Groupes AVEC (nom, pays, wallet, statut blocage)
- `members` : Membres (profil, rôle, soldes, historique)
- `platform_momo` : Comptes Momo centraux par pays
- `history` : Historique des transactions

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
- **Base de données** : SQLite3
- **Authentification** : JWT + bcrypt
- **PWA** : Service Worker + Web App Manifest
- **Mobile** : Capacitor (optionnel)

## 📋 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/refresh` - Rafraîchir token

### Groupes
- `GET /api/groups` - Liste des groupes (admin plateforme)
- `POST /api/groups` - Créer groupe/membre
- `GET /api/groups/:id` - Détails d'un groupe

### Membres
- `GET /api/members/:groupId` - Membres d'un groupe
- `POST /api/members` - Ajouter membre
- `PUT /api/members/:id` - Modifier membre

### Comptes Momo
- `GET /api/momo` - Liste des comptes Momo
- `POST /api/momo` - Ajouter compte Momo
- `DELETE /api/momo/:id` - Supprimer compte Momo
- `GET /api/countries` - Pays avec comptes Momo

### Autres
- `GET /api/stats` - Statistiques
- `GET/POST /api/history` - Historique transactions

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

**Développé pour les communautés AVEC d'Afrique de l'Ouest**
