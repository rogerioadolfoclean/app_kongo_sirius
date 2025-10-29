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
    console.log('utilisateur_id =', userId);

    // Récupérer la progression active pour l'étape 1
    const [etape1] = await conn.query("SELECT id FROM etapes_programme WHERE numero_etape = 1 LIMIT 1");
    if (etape1.length === 0) {
      console.error('Étape numéro 1 introuvable dans etapes_programme');
      await conn.end();
      process.exit(1);
    }
    const etape1Id = etape1[0].id;

    // Trouver la progression existante pour l'utilisateur et l'étape 1
    const [progRows] = await conn.query('SELECT * FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ? LIMIT 1', [userId, etape1Id]);
    if (progRows.length === 0) {
      console.error('Aucune progression trouvée pour l\'étape 1. Créez-en une d\'abord ou exécutez la simulation de paiement.');
      await conn.end();
      process.exit(1);
    }

    const prog = progRows[0];
    console.log('Progression trouvée:', { id: prog.id, statut: prog.statut, date_debut: prog.date_debut });

    // Mettre à jour la progression : essayé, mais si l'UPDATE déclenche une erreur
    // (mysql interdit parfois de modifier la même table dans un trigger),
    // on appellera manuellement la procédure stockée `activer_etape_suivante`
    // pour activer l'étape suivante.
    const note = 92.5;
    try {
      await conn.query('UPDATE progression_etudiants SET statut = ?, date_completion = NOW(), note = ?, tentatives = tentatives + 1 WHERE id = ?', ['terminé', note, prog.id]);
      console.log('Progression mise à jour en statut = terminé');
      // Petit délai pour que les triggers/procédures se déclenchent
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn('Update progression failed, fallback to manual activation:', e.message || e);
      // Appeler la procédure stockée manuellement pour activer l'étape suivante
      try {
        await conn.query('CALL activer_etape_suivante(?, ?)', [userId, etape1Id]);
        console.log('Procédure activer_etape_suivante appelée manuellement');
      } catch (procErr) {
        console.error('Erreur en appelant activer_etape_suivante:', procErr.message || procErr);
      }
      // attendre un court instant
      await new Promise(r => setTimeout(r, 500));
    }

    // Récupérer les progressions après l'action
    const [progressions] = await conn.query('SELECT pe.*, ep.numero_etape, ep.titre FROM progression_etudiants pe JOIN etapes_programme ep ON pe.etape_id = ep.id WHERE pe.utilisateur_id = ? ORDER BY ep.numero_etape', [userId]);

    console.log('\nProgressions actuelles:');
    progressions.forEach(p => console.log(p));

    // Notifications récentes
    const [notifications] = await conn.query('SELECT * FROM notifications WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 10', [userId]);
    console.log('\nNotifications récentes:');
    notifications.forEach(n => console.log(n));

    // Journaux récents
    const [journaux] = await conn.query('SELECT * FROM journaux_systeme WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 10', [userId]);
    console.log('\nJournaux récents:');
    journaux.forEach(j => console.log(j));

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur complete_step:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
})();