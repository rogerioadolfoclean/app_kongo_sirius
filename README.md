# 🌟 Application Conscience Kongo - Plateforme de Formation Spirituelle

## 📋 Description

Application web complète de gestion de formation spirituelle avec 12 étapes progressives, système automatique de progression, notifications et journalisation avancée.

## 🛠️ Installation

### Prérequis
- Node.js (version 14 ou supérieure)
- MySQL (version 8.0 ou supérieure)
- npm ou yarn

### 1. Installation des dépendances
```bash
cd d:\projet_web_2025\app_kongo_sirius
npm install
```

### 2. Configuration de la base de données

1. **Créer la base de données MySQL :**
   ```bash
   mysql -u root -p < database.sql
   ```

2. **Configurer les variables d'environnement :**
   Créer un fichier `.env` en copiant `.env.example` et en renseignant des valeurs sécurisées :
   ```
   cp .env.example .env
   # puis éditez .env et remplacez les placeholders par vos valeurs
   ```

### 3. Lancement de l'application
```bash
npm start
```

Ou pour le développement avec rechargement automatique :
```bash
npm run dev
```

## 🧪 Tests Étape par Étape

### Test 1 : Vérification de la connexion

1. **Accéder à l'application :**
   - Ouvrir http://localhost:3000
   - Vérifier que la page de connexion s'affiche correctement

2. **Tester la connexion administrateur :**
   - Nom d'utilisateur : `admin` (si présent dans la base de données)
   - Pour l'environnement de test, créez un compte admin avec un mot de passe temporaire et sécurisé en utilisant la requête d'exemple ci-dessous. Ne laissez jamais un mot de passe par défaut en production.

3. **Créer un admin de test :**
   ```sql
   INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) 
   VALUES ('test_admin', 'admin@test.com', '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'administrateur');
   ```
   - Nom d'utilisateur : `test_admin`
   - Mot de passe : `test123`

### Test 2 : Inscription d'un nouvel utilisateur

1. **Aller sur la page d'inscription :**
   - Cliquer sur "Créer un compte"
   - Remplir le formulaire avec des données valides

2. **Vérifier les déclencheurs automatiques :**
   ```sql
   -- Vérifier la création de l'utilisateur
   SELECT * FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur';
   
   -- Vérifier la notification de bienvenue
   SELECT * FROM notifications WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur');
   
   -- Vérifier la journalisation
   SELECT * FROM journaux_systeme WHERE action = 'UTILISATEUR_CRÉÉ';
   ```

### Test 3 : Tableau de bord et statistiques

1. **Se connecter avec l'utilisateur créé**
2. **Vérifier l'affichage des statistiques**
3. **Vérifier la liste des étapes du programme**

### Test 4 : Simulation d'un paiement

```sql
-- Insérer une inscription pour tester
INSERT INTO inscriptions (utilisateur_id, montant, devise, statut_paiement, methode_paiement) 
VALUES ((SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur'), 50.00, 'USD', 'en_attente', 'carte');

-- Simuler un paiement réussi
UPDATE inscriptions 
SET statut_paiement = 'payé', date_completion = NOW() 
WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur');
```

**Vérifications après paiement :**
```sql
-- Vérifier l'activation automatique de la première étape
SELECT * FROM progression_etudiants WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur');

-- Vérifier les notifications de paiement
SELECT * FROM notifications WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur') AND titre LIKE '%Paiement%';
```

### Test 5 : Progression automatique

```sql
-- Marquer la première étape comme terminée
UPDATE progression_etudiants 
SET statut = 'terminé', date_completion = NOW(), note = 85.50
WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur') 
AND etape_id = (SELECT id FROM etapes_programme WHERE numero_etape = 1);
```

**Vérifications :**
```sql
-- Vérifier l'activation automatique de l'étape suivante
SELECT * FROM progression_etudiants WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur') AND etape_id = (SELECT id FROM etapes_programme WHERE numero_etape = 2);

-- Vérifier les notifications de progression
SELECT * FROM notifications WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE nom_utilisateur = 'votre_nom_utilisateur') ORDER BY date_creation DESC LIMIT 3;
```

## 🔧 Fonctionnalités Automatiques

### 1. Système d'inscription automatique
- ✅ Création automatique du compte
- ✅ Notification de bienvenue
- ✅ Journalisation de l'action

### 2. Progression automatique
- ✅ Activation automatique de l'étape suivante
- ✅ Calcul automatique des dates
- ✅ Notifications de changement de statut

### 3. Gestion des paiements
- ✅ Activation de la formation après paiement
- ✅ Notifications de confirmation
- ✅ Déblocage automatique des étapes

### 4. Sécurité
- ✅ Limitation des tentatives de connexion
- ✅ Journalisation complète des activités
- ✅ Validation des permissions

## 📊 Structure de la Base de Données

### Tables principales :
- `utilisateurs` - Gestion des comptes utilisateurs
- `etapes_programme` - Les 12 étapes de formation
- `inscriptions` - Gestion des paiements
- `progression_etudiants` - Suivi individuel de progression
- `notifications` - Système de notifications
- `journaux_systeme` - Audit et journalisation
- `parametres_systeme` - Configuration système

### Déclencheurs automatiques :
- `apres_insertion_utilisateur` - Notification de bienvenue
- `apres_modification_utilisateur` - Suivi des changements
- `avant_insertion_progression` - Vérification des prérequis
- `apres_modification_progression` - Progression automatique
- `apres_inscription_payee` - Activation après paiement

### Procédures stockées :
- `activer_etape_suivante()` - Progression automatique
- `generer_rapport_mensuel()` - Rapports statistiques
- `nettoyer_anciens_logs()` - Maintenance automatique

## 🎯 Comptes de Test

### Compte test recommandé :
```sql
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) 
VALUES ('test_admin', 'admin@test.com', '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'administrateur');
```
- **Nom d'utilisateur :** test_admin
   - **Mot de passe :** choisissez un mot de passe fort pour les tests

## 🚀 Démarrage Rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer MySQL
mysql -u root -p < database.sql

# 3. Démarrer l'application
npm start

# 4. Ouvrir dans le navigateur
http://localhost:3000
```

## 📝 Notes de Développement

- **Framework :** Express.js avec EJS
- **Base de données :** MySQL avec déclencheurs automatiques
- **Authentification :** Sessions avec bcryptjs
- **Validation :** express-validator
- **Styles :** CSS responsive personnalisé
- **Automatisation :** Déclencheurs MySQL pour la progression

## 🐛 Dépannage

### Erreur de connexion MySQL :
```bash
# Vérifier MySQL
mysql -u root -p

# Vérifier la base de données
USE congo_knowledge_db;
SHOW TABLES;
```

### Erreur de dépendances :
```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install
```

### Erreur de mot de passe admin :
```sql
-- Créer un compte admin de test
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) 
VALUES ('admin_test', 'admin@test.com', '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'administrateur');
```

## 📞 Support

Pour toute question ou problème, créer un ticket dans le système de suivi des problèmes ou contacter l'équipe de développement.

---

**© 2025 Conscience Kongo - Plateforme de Formation Spirituelle**