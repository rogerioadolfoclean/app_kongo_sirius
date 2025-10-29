const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

(async () => {
  const config = { ...dbConfig, multipleStatements: true };

  const sql = `
  -- Create activation_queue table
  CREATE TABLE IF NOT EXISTS activation_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    source_etape_id INT NOT NULL,
    status ENUM('pending','processing','done','failed') DEFAULT 'pending',
    tentatives INT DEFAULT 0,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    result_message TEXT
  );
  -- Drop existing trigger and recreate to push to queue instead of calling procedure directly
  DROP TRIGGER IF EXISTS apres_modification_progression;

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

    -- Instead of calling the procedure directly (which can cause MySQL to error when modifying the same table),
    -- push an activation job to the queue which a separate worker will process.
    IF NEW.statut = 'terminé' AND OLD.statut != 'terminé' THEN
        INSERT INTO activation_queue (utilisateur_id, source_etape_id) VALUES (NEW.utilisateur_id, NEW.etape_id);
    END IF;
  END;
  `;

  let conn;
  try {
    conn = await mysql.createConnection(config);
    console.log('Connecté à MySQL — application des correctifs');
    await conn.query(sql);
    console.log('SQL exécuté : activation_queue créée et trigger remplacé.');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur apply_db_fixes:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
})();