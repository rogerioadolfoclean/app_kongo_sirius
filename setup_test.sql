-- Script de setup complet pour tests
-- Exécuter ce script pour créer la base de données et un compte admin de test

-- Création de la base de données
CREATE DATABASE IF NOT EXISTS congo_knowledge_db;
USE congo_knowledge_db;

-- Table des utilisateurs
CREATE TABLE utilisateurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom_utilisateur VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mot_de_passe VARCHAR(255) NOT NULL,
  role ENUM('administrateur', 'étudiant', 'enseignant') DEFAULT 'étudiant',
  statut ENUM('actif', 'inactif') DEFAULT 'actif',
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  derniere_connexion TIMESTAMP NULL,
  nombre_connexions INT DEFAULT 0
);

-- Table des étapes du programme
CREATE TABLE etapes_programme (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_etape INT NOT NULL UNIQUE,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  nom_groupe VARCHAR(100),
  duree_jours INT DEFAULT 30,
  statut ENUM('actif', 'inactif') DEFAULT 'actif',
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cree_par INT,
  FOREIGN KEY (cree_par) REFERENCES utilisateurs(id)
);

-- Table des inscriptions
CREATE TABLE inscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT,
  montant DECIMAL(10,2) NOT NULL,
  devise VARCHAR(3) DEFAULT 'USD',
  statut_paiement ENUM('en_attente', 'payé', 'échoué', 'remboursé') DEFAULT 'en_attente',
  methode_paiement VARCHAR(50),
  id_transaction VARCHAR(100),
  date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_completion TIMESTAMP NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
);

-- Table de progression des étudiants
CREATE TABLE progression_etudiants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT,
  etape_id INT,
  statut ENUM('non_commencé', 'en_cours', 'terminé', 'échoué') DEFAULT 'non_commencé',
  date_debut TIMESTAMP NULL,
  date_completion TIMESTAMP NULL,
  note DECIMAL(5,2) NULL,
  notes TEXT,
  tentatives INT DEFAULT 0,
  derniere_tentative TIMESTAMP NULL,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
  FOREIGN KEY (etape_id) REFERENCES etapes_programme(id) ON DELETE CASCADE,
  UNIQUE KEY utilisateur_etape_unique (utilisateur_id, etape_id)
);

-- Table d'audit/journalisation
CREATE TABLE journaux_systeme (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NULL,
  action VARCHAR(255) NOT NULL,
  nom_table VARCHAR(100),
  id_enregistrement INT,
  anciennes_valeurs JSON,
  nouvelles_valeurs JSON,
  adresse_ip VARCHAR(45),
  agent_utilisateur TEXT,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

-- Table des notifications
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT,
  titre VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'succès', 'avertissement', 'erreur') DEFAULT 'info',
  est_lu BOOLEAN DEFAULT FALSE,
  table_concerne VARCHAR(100),
  id_concerne INT,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_expiration TIMESTAMP NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
);

-- Table des paramètres système
CREATE TABLE parametres_systeme (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cle_parametre VARCHAR(100) UNIQUE NOT NULL,
  valeur_parametre TEXT,
  description TEXT,
  date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modifie_par INT,
  FOREIGN KEY (modifie_par) REFERENCES utilisateurs(id)
);

-- DÉCLENCHEURS AUTOMATIQUES

-- 1. Déclencheur pour journalisation automatique des utilisateurs
DELIMITER $$
CREATE TRIGGER apres_insertion_utilisateur
AFTER INSERT ON utilisateurs
FOR EACH ROW
BEGIN
    INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, nouvelles_valeurs, adresse_ip)
    VALUES (NEW.id, 'UTILISATEUR_CRÉÉ', 'utilisateurs', NEW.id, 
            JSON_OBJECT('nom_utilisateur', NEW.nom_utilisateur, 'email', NEW.email, 'role', NEW.role), 
            'SYSTÈME');
    
    -- Notification de bienvenue automatique
    INSERT INTO notifications (utilisateur_id, titre, message, type)
    VALUES (NEW.id, 'Bienvenue sur la plateforme', 
            CONCAT('Bienvenue ', NEW.nom_utilisateur, '! Votre compte a été créé avec succès.'), 
            'succès');
END$$

CREATE TRIGGER apres_modification_utilisateur
AFTER UPDATE ON utilisateurs
FOR EACH ROW
BEGIN
    IF OLD.statut != NEW.statut THEN
        INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, anciennes_valeurs, nouvelles_valeurs)
        VALUES (NEW.id, 'STATUT_UTILISATEUR_MODIFIÉ', 'utilisateurs', NEW.id,
                JSON_OBJECT('statut', OLD.statut),
                JSON_OBJECT('statut', NEW.statut));
                
        -- Notification de changement de statut
        INSERT INTO notifications (utilisateur_id, titre, message, type)
        VALUES (NEW.id, 'Changement de statut', 
                CONCAT('Votre statut a été changé à: ', NEW.statut), 
                'info');
    END IF;
    
    IF OLD.derniere_connexion != NEW.derniere_connexion THEN
        UPDATE utilisateurs SET nombre_connexions = nombre_connexions + 1 WHERE id = NEW.id;
    END IF;
END$$
DELIMITER ;

-- 2. Déclencheurs pour la progression automatique
DELIMITER $$
CREATE TRIGGER avant_insertion_progression
BEFORE INSERT ON progression_etudiants
FOR EACH ROW
BEGIN
    -- Vérifier si l'utilisateur a payé son inscription
    DECLARE statut_inscription VARCHAR(20) DEFAULT NULL;
    
    SELECT statut_paiement INTO statut_inscription 
    FROM inscriptions 
    WHERE utilisateur_id = NEW.utilisateur_id 
    ORDER BY date_inscription DESC 
    LIMIT 1;
    
    IF statut_inscription != 'payé' AND NEW.etape_id > 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'L''utilisateur doit avoir une inscription payée pour accéder à cette étape';
    END IF;
    
    -- Définir automatiquement la date de début si le statut est en_cours
    IF NEW.statut = 'en_cours' AND NEW.date_debut IS NULL THEN
        SET NEW.date_debut = CURRENT_TIMESTAMP;
    END IF;
    
    -- Définir automatiquement la date de completion si le statut est terminé
    IF NEW.statut = 'terminé' AND NEW.date_completion IS NULL THEN
        SET NEW.date_completion = CURRENT_TIMESTAMP;
        SET NEW.tentatives = NEW.tentatives + 1;
    END IF;
END$$

CREATE TRIGGER apres_modification_progression
AFTER UPDATE ON progression_etudiants
FOR EACH ROW
BEGIN
    -- Journalisation du changement de statut
    IF OLD.statut != NEW.statut THEN
        INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, anciennes_valeurs, nouvelles_valeurs)
        VALUES (NEW.utilisateur_id, 'STATUT_PROGRESSION_MODIFIÉ', 'progression_etudiants', NEW.id,
                JSON_OBJECT('statut', OLD.statut, 'etape_id', OLD.etape_id),
                JSON_OBJECT('statut', NEW.statut, 'etape_id', NEW.etape_id));
        
        -- Notification à l'utilisateur
        INSERT INTO notifications (utilisateur_id, titre, message, type, table_concerne, id_concerne)
        VALUES (NEW.utilisateur_id, 
                CONCAT('Progression Étape ', (SELECT numero_etape FROM etapes_programme WHERE id = NEW.etape_id)),
                CONCAT('Votre statut pour l''étape "', 
                      (SELECT titre FROM etapes_programme WHERE id = NEW.etape_id), 
                      '" est maintenant: ', NEW.statut),
                CASE NEW.statut 
                    WHEN 'terminé' THEN 'succès'
                    WHEN 'en_cours' THEN 'info'
                    WHEN 'échoué' THEN 'erreur'
                    ELSE 'info' END,
                'progression_etudiants', NEW.id);
    END IF;
    
    -- Déclencher automatiquement l'étape suivante si l'étape actuelle est terminée
    IF NEW.statut = 'terminé' AND OLD.statut != 'terminé' THEN
        CALL activer_etape_suivante(NEW.utilisateur_id, NEW.etape_id);
    END IF;
END$$
DELIMITER ;

-- 3. Déclencheurs pour les inscriptions automatiques
DELIMITER $$
CREATE TRIGGER apres_inscription_payee
AFTER UPDATE ON inscriptions
FOR EACH ROW
BEGIN
    IF OLD.statut_paiement != 'payé' AND NEW.statut_paiement = 'payé' THEN
        -- Journalisation du paiement
        INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, nouvelles_valeurs)
        VALUES (NEW.utilisateur_id, 'PAIEMENT_TERMINÉ', 'inscriptions', NEW.id,
                JSON_OBJECT('montant', NEW.montant, 'methode', NEW.methode_paiement));
        
        -- Notification de confirmation de paiement
        INSERT INTO notifications (utilisateur_id, titre, message, type)
        VALUES (NEW.utilisateur_id, 'Paiement Confirmé', 
                CONCAT('Votre paiement de ', NEW.montant, ' ', NEW.devise, ' a été confirmé. Vous pouvez maintenant commencer votre formation.'), 
                'succès');
        
        -- Activer automatiquement la première étape
        INSERT INTO progression_etudiants (utilisateur_id, etape_id, statut, date_debut)
        SELECT NEW.utilisateur_id, id, 'en_cours', CURRENT_TIMESTAMP
        FROM etapes_programme 
        WHERE numero_etape = 1;
    END IF;
END$$
DELIMITER ;

-- 4. Déclencheur pour journalisation automatique des modifications système
DELIMITER $$
CREATE TRIGGER apres_creation_etape
AFTER INSERT ON etapes_programme
FOR EACH ROW
BEGIN
    INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, nouvelles_valeurs)
    VALUES (NEW.cree_par, 'ÉTAPE_CRÉÉE', 'etapes_programme', NEW.id,
            JSON_OBJECT('numero_etape', NEW.numero_etape, 'titre', NEW.titre, 'nom_groupe', NEW.nom_groupe));
END$$

CREATE TRIGGER apres_modification_etape
AFTER UPDATE ON etapes_programme
FOR EACH ROW
BEGIN
    INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, id_enregistrement, anciennes_valeurs, nouvelles_valeurs)
    VALUES ((SELECT cree_par FROM etapes_programme WHERE id = NEW.id), 'ÉTAPE_MODIFIÉE', 'etapes_programme', NEW.id,
            JSON_OBJECT('titre', OLD.titre, 'description', OLD.description),
            JSON_OBJECT('titre', NEW.titre, 'description', NEW.description));
END$$
DELIMITER ;

-- PROCÉDURES STOCKÉES

DELIMITER $$
CREATE PROCEDURE activer_etape_suivante(IN utilisateur_id INT, IN etape_actuelle_id INT)
BEGIN
    DECLARE prochaine_etape_id INT DEFAULT NULL;
    DECLARE numero_etape_actuelle INT DEFAULT NULL;
    
    -- Récupérer le numéro de l'étape actuelle
    SELECT numero_etape INTO numero_etape_actuelle 
    FROM etapes_programme 
    WHERE id = etape_actuelle_id;
    
    -- Trouver l'étape suivante
    SELECT id INTO prochaine_etape_id 
    FROM etapes_programme 
    WHERE numero_etape = numero_etape_actuelle + 1 
    AND statut = 'actif'
    LIMIT 1;
    
    -- Créer automatiquement l'entrée pour l'étape suivante
    IF prochaine_etape_id IS NOT NULL THEN
        INSERT INTO progression_etudiants (utilisateur_id, etape_id, statut, date_debut)
        VALUES (utilisateur_id, prochaine_etape_id, 'en_cours', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE statut = 'en_cours', date_debut = CURRENT_TIMESTAMP;
    END IF;
END$$

CREATE PROCEDURE generer_rapport_mensuel(IN annee_mois VARCHAR(7))
BEGIN
    SELECT 
        u.nom_utilisateur,
        u.email,
        COUNT(DISTINCT pe.etape_id) as etapes_terminees,
        MAX(ep.numero_etape) as etape_max_atteinte,
        AVG(pe.note) as note_moyenne,
        SUM(CASE WHEN pe.statut = 'terminé' THEN 1 ELSE 0 END) as total_terminees,
        SUM(CASE WHEN pe.statut = 'en_cours' THEN 1 ELSE 0 END) as total_en_cours
    FROM utilisateurs u
    LEFT JOIN progression_etudiants pe ON u.id = pe.utilisateur_id
    LEFT JOIN etapes_programme ep ON pe.etape_id = ep.id
    WHERE DATE_FORMAT(pe.date_modification, '%Y-%m') = annee_mois
    GROUP BY u.id, u.nom_utilisateur, u.email;
END$$

CREATE PROCEDURE nettoyer_anciens_logs(IN jours_anciens INT)
BEGIN
    DELETE FROM journaux_systeme 
    WHERE date_creation < DATE_SUB(NOW(), INTERVAL jours_anciens DAY);
    
    DELETE FROM notifications 
    WHERE date_creation < DATE_SUB(NOW(), INTERVAL jours_anciens DAY) 
    AND est_lu = TRUE;
END$$
DELIMITER ;

-- INSERTION DES DONNÉES INITIALES

-- Étapes du programme basées sur l'image fournie
INSERT INTO etapes_programme (numero_etape, titre, description, nom_groupe, duree_jours) VALUES
(1, 'INSCRIPTION', 'Processus d inscription et paiement des frais', 'Inscription', 1),
(2, 'ÉTAPE PRÉPARATOIRE', 'Les Notions préliminaires - La différence entre une école initiatique et une secte', 'Groupe 1', 30),
(3, 'FORMATION THÉORIQUE', 'Les notions spirituelles - La différence entre la religion, le mysticisme et la spiritualité', 'Groupe 2', 45),
(4, 'FORMATION INITIATIQUE', 'Les séances des pratiques - Les notions réservées aux initiés', 'Groupe 3', 60),
(5, 'PREMIÈRE INITIATION', 'Ouverture de la prospérité ancestrale', 'Groupe 3', 30),
(6, 'CLAIRVOYANCE', 'Ouverture du 3ème Œil et développement de la vision spirituelle', 'Groupe 3', 45),
(7, 'VOYAGE ASTRAL', 'Accès et maîtrise du voyage astral', 'Groupe 3', 60),
(8, 'PRÉPARATION INITIATION DU POUVOIR', 'Réouverture des facultés spirituelles et connexion de la Racine', 'Pouvoir', 90),
(9, 'HAUTES PRATIQUES', 'Pratiques avancées des initiés et contact avec les mondes surnaturels', 'Pouvoir', 60),
(10, 'INITIATION DU POUVOIR', 'Devenir le maître de sa vie et activation des pouvoirs spirituels', 'Pouvoir', 30),
(11, 'INITIATION DE L ÂME', 'Transition de l état animal à l état divin', 'Âme', 90),
(12, 'SYMBIOSE COSMIQUE', 'Contact avec les êtres galactiques et partage des secrets scientifiques', 'Symbiose', 120);

-- Paramètres système par défaut
INSERT INTO parametres_systeme (cle_parametre, valeur_parametre, description) VALUES
('frais_inscription', '50', 'Frais d inscription en USD'),
('tentatives_connexion_max', '5', 'Nombre maximum de tentatives de connexion'),
('delai_session', '3600', 'Délai d expiration de session en secondes'),
('avance_auto_active', '1', 'Activation automatique des étapes suivantes'),
('frequence_sauvegarde', 'quotidienne', 'Fréquence des sauvegardes automatiques'),
('notifications_activees', '1', 'Activation des notifications automatiques');

-- COMPTES DE TEST

-- Administrateur de test (mot de passe: test123)
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES 
('admin_test', 'admin@test.com', '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'administrateur');

-- Étudiant de test (mot de passe: test123)  
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES 
('etudiant_test', 'etudiant@test.com', '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'étudiant');

-- Inscription de test pour l'étudiant
INSERT INTO inscriptions (utilisateur_id, montant, devise, statut_paiement, methode_paiement, id_transaction) 
VALUES ((SELECT id FROM utilisateurs WHERE nom_utilisateur = 'etudiant_test'), 50.00, 'USD', 'payé', 'carte', 'TEST_TRANSACTION_001');

-- Progression de test pour l'étudiant
INSERT INTO progression_etudiants (utilisateur_id, etape_id, statut, date_debut, note) 
VALUES 
((SELECT id FROM utilisateurs WHERE nom_utilisateur = 'etudiant_test'), 1, 'terminé', DATE_SUB(NOW(), INTERVAL 10 DAY), 85.50),
((SELECT id FROM utilisateurs WHERE nom_utilisateur = 'etudiant_test'), 2, 'en_cours', DATE_SUB(NOW(), INTERVAL 5 DAY), NULL);

-- Affichage des informations de test
SELECT '=== COMPTES DE TEST CRÉÉS ===' as message;
SELECT 'Administrateur:' as type, 'admin_test' as nom_utilisateur, 'test123' as mot_de_passe;
SELECT 'Étudiant:' as type, 'etudiant_test' as nom_utilisateur, 'test123' as mot_de_passe;
SELECT '=== BASE DE DONNÉES CONFIGURÉE ===' as message;