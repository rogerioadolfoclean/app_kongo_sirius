require('dotenv').config();
const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

(async () => {
  const config = dbConfig;

  const sql = `
DROP TRIGGER IF EXISTS apres_modification_utilisateur;
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

    -- NOTE: removed the UPDATE utilisateurs SET nombre_connexions ... inside the trigger
END;
`;

  let conn;
  try {
    conn = await mysql.createConnection(config);
    console.log('Applying user trigger fix...');
    await conn.query(sql);
    console.log('Trigger apres_modification_utilisateur replaced without internal utilisateurs UPDATE.');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error applying trigger fix:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
})();
