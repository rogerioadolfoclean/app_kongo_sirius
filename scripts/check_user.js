const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node check_user.js <nom_utilisateur>');
  process.exit(2);
}

(async () => {
  const config = dbConfig;

  try {
    const conn = await mysql.createConnection(config);
    console.log(`Connecté à MySQL — vérification pour utilisateur: ${username}`);

    const [[userRow]] = await conn.query('SELECT * FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    if (!userRow) {
      console.log(`Aucun utilisateur trouvé avec nom_utilisateur='${username}'`);
      await conn.end();
      process.exit(0);
    }

    console.log('Utilisateur trouvé:');
    console.log({ id: userRow.id, nom_utilisateur: userRow.nom_utilisateur, email: userRow.email, role: userRow.role, statut: userRow.statut });

    const [notifications] = await conn.query('SELECT id, titre, message, est_lu, date_creation FROM notifications WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 10', [userRow.id]);
    console.log(`\nNotifications (dernieres ${notifications.length}):`);
    notifications.forEach(n => console.log(n));

    const [journaux] = await conn.query('SELECT id, action, nom_table, date_creation, adresse_ip FROM journaux_systeme WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 10', [userRow.id]);
    console.log(`\nJournaux (dernieres ${journaux.length}):`);
    journaux.forEach(j => console.log(j));

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message || err);
    process.exit(2);
  }
})();