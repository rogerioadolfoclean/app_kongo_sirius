const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

(async () => {
  const config = dbConfig;

  try {
    const conn = await mysql.createConnection(config);
    console.log('Connecté à MySQL — simulation paiement');

    // Trouver l'utilisateur deep_test
    const [users] = await conn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', ['deep_test']);
    if (users.length === 0) {
      console.error('Utilisateur deep_test introuvable');
      await conn.end();
      process.exit(2);
    }
    const userId = users[0].id;
    console.log('utilisateur_id =', userId);

    // Insérer inscription en attente
    const [insertRes] = await conn.query(
      'INSERT INTO inscriptions (utilisateur_id, montant, devise, statut_paiement, methode_paiement, date_inscription) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, 50.00, 'USD', 'en_attente', 'simulation']
    );
    const inscriptionId = insertRes.insertId;
    console.log('Inscription insérée id =', inscriptionId, '(statut en_attente)');

    // Determine the first programme step (used by triggers to create progression)
    const [firstEtapeRows] = await conn.query('SELECT id FROM etapes_programme ORDER BY id ASC LIMIT 1');
    const firstEtapeId = firstEtapeRows.length ? firstEtapeRows[0].id : null;

    // If the user already has a progression for the first step, avoid marking the
    // inscription as paid here to prevent the trigger from attempting to insert a
    // duplicate progression (this makes the script idempotent for test runs).
    if (firstEtapeId) {
      const [existing] = await conn.query(
        'SELECT id FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ? LIMIT 1',
        [userId, firstEtapeId]
      );
      if (existing.length > 0) {
        console.log(`Progression déjà présente pour utilisateur=${userId} et etape=${firstEtapeId}, saut de la mise à jour paiement pour éviter DUP clé`);
      } else {
        // Mettre à jour pour simuler paiement
        await conn.query(
          'UPDATE inscriptions SET statut_paiement = ?, date_completion = NOW() WHERE id = ?',
          ['payé', inscriptionId]
        );
        console.log('Inscription mise à jour en statut = payé (devrait déclencher le trigger)');
      }
    } else {
      // Fallback: no etapes_programme defined; still mark paid
      await conn.query(
        'UPDATE inscriptions SET statut_paiement = ?, date_completion = NOW() WHERE id = ?',
        ['payé', inscriptionId]
      );
      console.log('Inscription mise à jour en statut = payé (pas d\'etape connue)');
    }

    // Petit délai pour que les triggers s'exécutent
    await new Promise(r => setTimeout(r, 500));

    // Vérifier progression_etudiants
    const [progressions] = await conn.query('SELECT * FROM progression_etudiants WHERE utilisateur_id = ? ORDER BY id DESC', [userId]);
    console.log('\nProgressions trouvées:', progressions.length);
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
    console.error('Erreur simulation paiement:', err.message || err);
    process.exit(2);
  }
})();