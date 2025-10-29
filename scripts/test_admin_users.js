require('dotenv').config();
const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

(async () => {
  const config = dbConfig;

  let conn;
  try {
    conn = await mysql.createConnection(config);
    console.log('Connecté à la BDD — test admin utilisateurs');

    // Create
    const username = 'admin_test_' + Date.now().toString().slice(-4);
    const email = `${username}@example.com`;
    const pw = 'Test12345';
    const [insert] = await conn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, email, pw, 'enseignant']);
    console.log('Utilisateur créé id=', insert.insertId);

    // Read
    const [[userRow]] = await conn.query('SELECT id, nom_utilisateur, email, role, statut FROM utilisateurs WHERE id = ?', [insert.insertId]);
    console.log('Lecture utilisateur:', userRow);

    // Update
    await conn.query('UPDATE utilisateurs SET email = ? WHERE id = ?', ['updated_'+email, insert.insertId]);
    const [[afterUpdate]] = await conn.query('SELECT email FROM utilisateurs WHERE id = ?', [insert.insertId]);
    console.log('Après update email=', afterUpdate.email);

    // Delete
    await conn.query('DELETE FROM utilisateurs WHERE id = ?', [insert.insertId]);
    console.log('Utilisateur supprimé id=', insert.insertId);

    // Check journaux entries
    const [journaux] = await conn.query('SELECT id, action, nom_table, date_creation FROM journaux_systeme WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 5', [insert.insertId]);
    console.log('Journaux récents pour cet utilisateur (s ils existent):');
    journaux.forEach(j => console.log(j));

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur test_admin_users:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
})();
