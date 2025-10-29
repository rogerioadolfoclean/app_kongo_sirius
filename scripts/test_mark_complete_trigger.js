const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

(async () => {
  const config = dbConfig;

  let conn;
  try {
    conn = await mysql.createConnection(config);
    console.log('Connecté à la BDD');

    // Récupérer l'utilisateur deep_test
    const [users] = await conn.query("SELECT id FROM utilisateurs WHERE nom_utilisateur = ?", ['deep_test']);
    if (users.length === 0) {
      console.error('Utilisateur deep_test introuvable');
      await conn.end();
      process.exit(1);
    }
    const userId = users[0].id;

    // Récupérer l'id de l'étape 1
    const [etape1] = await conn.query("SELECT id FROM etapes_programme WHERE numero_etape = 1 LIMIT 1");
    const etape1Id = etape1[0].id;

    // Trouver progression pour cet utilisateur et étape
    const [[prog]] = await conn.query('SELECT id, statut FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ? LIMIT 1', [userId, etape1Id]);
    if (!prog) {
      console.error('Aucune progression pour l\'etape 1 trouvée.');
      await conn.end();
      process.exit(1);
    }

    console.log('Current progression:', prog);

    // Mettre à jour statut -> terminé (ce trigger va insérer une entrée dans activation_queue)
    await conn.query('UPDATE progression_etudiants SET statut = ? WHERE id = ?', ['terminé', prog.id]);
    console.log('Progression mise à jour en terminé (trigger doit créer un job)');

    // Lister activation_queue
    const [queue] = await conn.query('SELECT * FROM activation_queue WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 5', [userId]);
    console.log('Activation queue entries (recent):', queue.length);
    queue.forEach(q => console.log(q));

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur test_mark_complete_trigger:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
})();