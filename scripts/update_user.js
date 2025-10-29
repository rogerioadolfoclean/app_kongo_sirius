const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

const username = process.argv[2] || 'deep_test';
const newEmail = process.argv[3] || null;

(async () => {
  const config = dbConfig;

  try {
    const conn = await mysql.createConnection(config);
    console.log(`Connecté à la BDD — mise à jour pour utilisateur: ${username}`);

    const [users] = await conn.query('SELECT id, nom_utilisateur, email, statut FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    if (users.length === 0) {
      console.error(`Aucun utilisateur trouvé avec nom_utilisateur='${username}'`);
      await conn.end();
      process.exit(1);
    }

    const user = users[0];
    console.log('Avant mise à jour:', user);

    // Save current statut/email to revert later
    const originalStatut = user.statut;
    const originalEmail = user.email;

  // 1) Update statut to 'inactif' to test triggers (allowed ENUM values are 'actif'|'inactif')
  await conn.query("UPDATE utilisateurs SET statut = 'inactif' WHERE id = ?", [user.id]);
  console.log(`Statut mis à jour en 'inactif' pour id=${user.id}`);

    // Read recent journaux to see trigger effect
    const [journauxAfterSuspend] = await conn.query('SELECT id, action, nom_table, date_creation FROM journaux_systeme WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 5', [user.id]);
    console.log('\nJournaux récents après mise à jour statut:');
    journauxAfterSuspend.forEach(j => console.log(j));

    // 2) Optionally update email if provided
    if (newEmail) {
      await conn.query('UPDATE utilisateurs SET email = ? WHERE id = ?', [newEmail, user.id]);
      console.log(`Email mis à jour vers '${newEmail}'`);
    }

    // 3) Revert statut and email to original values
    await conn.query('UPDATE utilisateurs SET statut = ?, email = ? WHERE id = ?', [originalStatut, originalEmail, user.id]);
    console.log('Statut et email restaurés à leurs valeurs d\'origine.');

    const [[finalUser]] = await conn.query('SELECT id, nom_utilisateur, email, statut FROM utilisateurs WHERE id = ?', [user.id]);
    console.log('\nÉtat final de l\'utilisateur:', finalUser);

    // Show recent notifications and journaux
    const [notifications] = await conn.query('SELECT id, titre, message, est_lu, date_creation FROM notifications WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 5', [user.id]);
    console.log('\nNotifications récentes:');
    notifications.forEach(n => console.log(n));

    const [journauxFinal] = await conn.query('SELECT id, action, nom_table, date_creation FROM journaux_systeme WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 10', [user.id]);
    console.log('\nJournaux récents (final):');
    journauxFinal.forEach(j => console.log(j));

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message || err);
    process.exit(2);
  }
})();
