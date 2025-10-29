require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const rateLimit = require('express-rate-limit');
const { dbConfig: centralDbConfig, sessionSecret } = require('./lib/config');
const path = require('path');
const bcrypt = require('bcryptjs');
const csurf = require('csurf');
// Optional Redis session store
let RedisStore;
let redisClient;
// Removed unused PDF and CSV writer imports to clean ESLint warnings
const moment = require('moment');
const { body, validationResult } = require('express-validator');

const app = express();
const port = process.env.PORT || 3000;

// Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Basic security headers
app.use(helmet());
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: (function(){
    // If REDIS_URL provided, try to use Redis store
    try {
      if (process.env.REDIS_URL) {
        const Redis = require('redis');
        const connectRedis = require('connect-redis');
        redisClient = Redis.createClient({ url: process.env.REDIS_URL });
        redisClient.connect().catch(err => console.warn('Redis connect warning:', err.message || err));
        RedisStore = connectRedis(session);
        return new RedisStore({ client: redisClient });
      }
    } catch (e) {
      console.warn('Redis session store not available:', e.message || e);
    }
    return undefined;
  })(),
  cookie: { 
    secure: (process.env.NODE_ENV === 'production'), 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// CSRF protection middleware (apply on admin routes selectively)
const csrfProtection = csurf({ cookie: false });

// Configuration de la base de données (centralized)
const dbConfig = {
  ...centralDbConfig,
  charset: 'utf8mb4',
  timezone: '+00:00'
};

// Pool de connexions
const pool = mysql.createPool({
  ...dbConfig,
  connectionLimit: 10,
  // mysql2 pool valid options: connectTimeout (ms), waitForConnections, queueLimit
  connectTimeout: 60000,
  waitForConnections: true,
  queueLimit: 0
});

// Middleware d'authentification
function requiertAuthentification(req, res, next) {
  if (req.session.utilisateur && req.session.utilisateur.statut === 'actif') {
    next();
  } else {
    res.redirect('/connexion');
  }
}

function requiertAdministrateur(req, res, next) {
  if (req.session.utilisateur && req.session.utilisateur.role === 'administrateur') {
    next();
  } else {
    res.status(403).render('erreur', { 
      erreur: 'Accès non autorisé. Droits administrateur requis.',
      utilisateur: req.session.utilisateur 
    });
  }
}

// Note: `requiertEnseignantOuAdmin` was removed because it was defined but not
// used anywhere in the codebase. Add it back if you need teacher-or-admin guard.

// Routes principales
app.get('/', (req, res) => {
  if (req.session.utilisateur) {
    res.redirect('/tableau-de-bord');
  } else {
    res.render('auth/connexion', { 
      message: null,
      anneeCourante: new Date().getFullYear()
    });
  }
});

// Connexion
app.get('/connexion', (req, res) => {
  res.render('auth/connexion', { 
    message: null,
    anneeCourante: new Date().getFullYear()
  });
});

// Rate limit login attempts per IP
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Trop de tentatives, réessayez plus tard.' });

app.post('/connexion', loginLimiter, [
  body('nom_utilisateur').notEmpty().withMessage('Le nom d\'utilisateur est requis'),
  body('mot_de_passe').notEmpty().withMessage('Le mot de passe est requis')
], async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.render('auth/connexion', { 
      message: erreurs.array()[0].msg,
      anneeCourante: new Date().getFullYear()
    });
  }

  const { nom_utilisateur, mot_de_passe } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  try {
    const connexion = await pool.getConnection();
    
    // Vérifier les tentatives récentes
    const [tentativesRecentes] = await connexion.execute(
      `SELECT COUNT(*) as compte FROM journaux_systeme 
       WHERE adresse_ip = ? AND action = 'CONNEXION_ECHOUEE' 
       AND date_creation > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [ip]
    );
    
    if (tentativesRecentes[0].compte >= 5) {
      await connexion.release();
      return res.render('auth/connexion', { 
        message: 'Trop de tentatives échouées. Veuillez réessayer dans 15 minutes.',
        anneeCourante: new Date().getFullYear()
      });
    }
    
    const [utilisateurs] = await connexion.execute(
      'SELECT * FROM utilisateurs WHERE nom_utilisateur = ? AND statut = "actif"',
      [nom_utilisateur]
    );
    
    if (utilisateurs.length > 0) {
      const utilisateur = utilisateurs[0];
      const motDePasseValide = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe);
      
      if (motDePasseValide) {
        // Mettre à jour les infos de connexion
        await connexion.execute(
          'UPDATE utilisateurs SET derniere_connexion = NOW(), nombre_connexions = nombre_connexions + 1 WHERE id = ?',
          [utilisateur.id]
        );
        
        req.session.utilisateur = {
          id: utilisateur.id,
          nom_utilisateur: utilisateur.nom_utilisateur,
          email: utilisateur.email,
          role: utilisateur.role,
          statut: utilisateur.statut,
          derniere_connexion: utilisateur.derniere_connexion
        };
        
        // Journalisation de la connexion réussie
        await connexion.execute(
          'INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)',
          [utilisateur.id, 'CONNEXION_REUSSIE', 'utilisateurs', ip]
        );
        
        await connexion.release();
        
        // Redirection basée sur le rôle
        if (utilisateur.role === 'administrateur') {
          res.redirect('/admin/tableau-de-bord');
        } else {
          res.redirect('/tableau-de-bord');
        }
      } else {
        // Journalisation de la tentative échouée
        await connexion.execute(
          'INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)',
          [utilisateur.id, 'CONNEXION_ECHOUEE', 'utilisateurs', ip]
        );
        
        await connexion.release();
        res.render('auth/connexion', { 
          message: 'Identifiants incorrects',
          anneeCourante: new Date().getFullYear()
        });
      }
    } else {
      await connexion.release();
      res.render('auth/connexion', { 
        message: 'Utilisateur non trouvé ou compte inactif',
        anneeCourante: new Date().getFullYear()
      });
    }
  } catch (erreur) {
    console.error('Erreur de connexion:', erreur);
    res.render('auth/connexion', { 
      message: 'Erreur de connexion au serveur',
      anneeCourante: new Date().getFullYear()
    });
  }
});

// Inscription
app.get('/inscription', (req, res) => {
  res.render('auth/inscription', { 
    message: null,
    anneeCourante: new Date().getFullYear()
  });
});

app.post('/inscription', [
  body('nom_utilisateur').isLength({ min: 3 }).withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('confirmation_mot_de_passe').custom((value, { req }) => {
    if (value !== req.body.mot_de_passe) {
      throw new Error('Les mots de passe ne correspondent pas');
    }
    return true;
  })
], async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.render('auth/inscription', { 
      message: erreurs.array()[0].msg,
      anneeCourante: new Date().getFullYear()
    });
  }

  const { nom_utilisateur, email, mot_de_passe } = req.body;
  
  try {
    const connexion = await pool.getConnection();
    
    // Vérifier si l'utilisateur existe déjà
    const [utilisateursExistants] = await connexion.execute(
      'SELECT id FROM utilisateurs WHERE nom_utilisateur = ? OR email = ?',
      [nom_utilisateur, email]
    );
    
    if (utilisateursExistants.length > 0) {
      await connexion.release();
      return res.render('auth/inscription', { 
        message: 'Nom d\'utilisateur ou email déjà utilisé',
        anneeCourante: new Date().getFullYear()
      });
    }
    
    // Hasher le mot de passe
    const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
    
    // Créer l'utilisateur
    const [resultat] = await connexion.execute(
      'INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, "étudiant")',
      [nom_utilisateur, email, motDePasseHache]
    );
    
    // Journalisation de l'inscription
    await connexion.execute(
      'INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)',
      [resultat.insertId, 'INSCRIPTION_REUSSIE', 'utilisateurs', req.ip]
    );
    
    await connexion.release();
    res.render('auth/connexion', { 
      message: 'Inscription réussie! Veuillez vous connecter.',
      anneeCourante: new Date().getFullYear()
    });
  } catch (erreur) {
    console.error('Erreur d\'inscription:', erreur);
    res.render('auth/inscription', { 
      message: 'Erreur lors de l\'inscription',
      anneeCourante: new Date().getFullYear()
    });
  }
});

// Tableau de bord
app.get('/tableau-de-bord', requiertAuthentification, async (req, res) => {
  try {
    const connexion = await pool.getConnection();
    const utilisateurId = req.session.utilisateur.id;
    
    // Statistiques pour le tableau de bord
    const [statistiquesUtilisateur] = await connexion.execute(`
      SELECT 
        COUNT(*) as total_etapes,
        SUM(CASE WHEN pe.statut = 'terminé' THEN 1 ELSE 0 END) as etapes_terminees,
        SUM(CASE WHEN pe.statut = 'en_cours' THEN 1 ELSE 0 END) as etapes_en_cours
      FROM etapes_programme ep
      LEFT JOIN progression_etudiants pe ON ep.id = pe.etape_id AND pe.utilisateur_id = ?
    `, [utilisateurId]);
    
    // Progression actuelle
    const [progressionActuelle] = await connexion.execute(`
      SELECT ep.*, pe.statut, pe.date_debut, pe.date_completion, pe.note
      FROM etapes_programme ep
      LEFT JOIN progression_etudiants pe ON ep.id = pe.etape_id AND pe.utilisateur_id = ?
      ORDER BY ep.numero_etape
    `, [utilisateurId]);
    
    // Notifications non lues
    const [notifications] = await connexion.execute(`
      SELECT * FROM notifications 
      WHERE utilisateur_id = ? AND est_lu = FALSE 
      ORDER BY date_creation DESC 
      LIMIT 5
    `, [utilisateurId]);
    
    await connexion.release();
    
    res.render('tableau-de-bord/index', {
      utilisateur: req.session.utilisateur,
      statistiques: statistiquesUtilisateur[0],
      progression: progressionActuelle,
      notifications: notifications,
      moment: moment
    });
  } catch (erreur) {
    console.error('Erreur tableau de bord:', erreur);
    res.status(500).render('erreur', { 
      erreur: 'Erreur serveur',
      utilisateur: req.session.utilisateur 
    });
  }
});

// Gestion des étapes du programme
app.get('/programme/etapes', requiertAuthentification, async (req, res) => {
  try {
    const connexion = await pool.getConnection();
    const [etapes] = await connexion.execute('SELECT * FROM etapes_programme ORDER BY numero_etape');
    await connexion.release();
    
    res.render('programme/etapes', {
      utilisateur: req.session.utilisateur,
      etapes: etapes
    });
  } catch (erreur) {
    console.error('Erreur récupération étapes:', erreur);
    res.status(500).render('erreur', { 
      erreur: 'Erreur serveur',
      utilisateur: req.session.utilisateur 
    });
  }
});

// Tableau de bord administrateur
app.get('/admin/tableau-de-bord', requiertAdministrateur, async (req, res) => {
  try {
    const connexion = await pool.getConnection();
    const [stats] = await connexion.execute(`
      SELECT 
        (SELECT COUNT(*) FROM utilisateurs) as total_utilisateurs,
        (SELECT COUNT(*) FROM inscriptions WHERE statut_paiement = 'payé') as inscriptions_payees,
        (SELECT COUNT(*) FROM progression_etudiants WHERE statut = 'terminé') as total_etapes_terminees
    `);
    await connexion.release();

    res.render('admin/tableau-de-bord', {
      utilisateur: req.session.utilisateur,
      stats: stats[0],
      moment: moment
    });
  } catch (erreur) {
    console.error('Erreur admin tableau de bord:', erreur);
    res.status(500).render('erreur', { 
      erreur: 'Erreur serveur',
      utilisateur: req.session.utilisateur 
    });
  }
});

// Admin CRUD - Utilisateurs (minimal)
app.get('/admin/utilisateurs', requiertAdministrateur, async (req, res) => {
  try {
    const connexion = await pool.getConnection();
    const [utilisateurs] = await connexion.execute('SELECT id, nom_utilisateur, email, role, statut, date_creation FROM utilisateurs ORDER BY id DESC');
    await connexion.release();
    // Provide CSRF token for forms
    const token = req.csrfToken ? req.csrfToken() : null;
    res.render('admin/utilisateurs/list', { utilisateur: req.session.utilisateur, utilisateurs, csrfToken: token });
  } catch (err) {
    console.error('Erreur admin utilisateurs list:', err);
    res.status(500).render('erreur', { erreur: 'Erreur serveur', utilisateur: req.session.utilisateur });
  }
});

app.get('/admin/utilisateurs/creer', requiertAdministrateur, csrfProtection, (req, res) => {
  res.render('admin/utilisateurs/form', { utilisateur: req.session.utilisateur, action: 'create', utilisateurData: {}, csrfToken: req.csrfToken() });
});

app.post('/admin/utilisateurs/creer', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const { nom_utilisateur, email, mot_de_passe, role } = req.body;
    const connexion = await pool.getConnection();
    const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
    const [result] = await connexion.execute('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [nom_utilisateur, email, motDePasseHache, role || 'étudiant']);
    await connexion.execute('INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)', [result.insertId, 'UTILISATEUR_ADMIN_CRÉE', 'utilisateurs', req.ip]);
    await connexion.release();
    res.redirect('/admin/utilisateurs');
  } catch (err) {
    console.error('Erreur creating user:', err);
    res.status(500).render('erreur', { erreur: 'Erreur création utilisateur', utilisateur: req.session.utilisateur });
  }
});

app.get('/admin/utilisateurs/:id/modifier', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const connexion = await pool.getConnection();
    const [rows] = await connexion.execute('SELECT id, nom_utilisateur, email, role, statut FROM utilisateurs WHERE id = ?', [id]);
    await connexion.release();
    if (rows.length === 0) return res.status(404).render('erreur', { erreur: 'Utilisateur non trouvé', utilisateur: req.session.utilisateur });
    res.render('admin/utilisateurs/form', { utilisateur: req.session.utilisateur, action: 'edit', utilisateurData: rows[0], csrfToken: req.csrfToken() });
  } catch (err) {
    console.error('Erreur get utilisateur:', err);
    res.status(500).render('erreur', { erreur: 'Erreur serveur', utilisateur: req.session.utilisateur });
  }
});

app.post('/admin/utilisateurs/:id/modifier', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nom_utilisateur, email, role, statut, mot_de_passe } = req.body;
    const connexion = await pool.getConnection();
    if (mot_de_passe && mot_de_passe.trim().length > 0) {
      const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
      await connexion.execute('UPDATE utilisateurs SET nom_utilisateur = ?, email = ?, role = ?, statut = ?, mot_de_passe = ? WHERE id = ?', [nom_utilisateur, email, role, statut, motDePasseHache, id]);
    } else {
      await connexion.execute('UPDATE utilisateurs SET nom_utilisateur = ?, email = ?, role = ?, statut = ? WHERE id = ?', [nom_utilisateur, email, role, statut, id]);
    }
    await connexion.execute('INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)', [id, 'UTILISATEUR_ADMIN_MODIFIE', 'utilisateurs', req.ip]);
    await connexion.release();
    res.redirect('/admin/utilisateurs');
  } catch (err) {
    console.error('Erreur update utilisateur:', err);
    res.status(500).render('erreur', { erreur: 'Erreur mise à jour utilisateur', utilisateur: req.session.utilisateur });
  }
});

app.post('/admin/utilisateurs/:id/supprimer', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const connexion = await pool.getConnection();
    // Log deletion first (use NULL utilisateur_id in journaux if user will be removed)
    await connexion.execute('INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)', [id, 'UTILISATEUR_ADMIN_SUPPRIME', 'utilisateurs', req.ip]);
    await connexion.execute('DELETE FROM utilisateurs WHERE id = ?', [id]);
    await connexion.release();
    res.redirect('/admin/utilisateurs');
  } catch (err) {
    console.error('Erreur delete utilisateur:', err);
    res.status(500).render('erreur', { erreur: 'Erreur suppression utilisateur', utilisateur: req.session.utilisateur });
  }
});

// Admin activation_queue UI
app.get('/admin/activation-queue', requiertAdministrateur, async (req, res) => {
  try {
    const connexion = await pool.getConnection();
    const [jobs] = await connexion.execute('SELECT * FROM activation_queue ORDER BY date_creation DESC LIMIT 200');
    await connexion.release();
    res.render('admin/activation_queue/list', { utilisateur: req.session.utilisateur, jobs, csrfToken: req.csrfToken ? req.csrfToken() : null });
  } catch (err) {
    console.error('Erreur activation_queue list:', err);
    res.status(500).render('erreur', { erreur: 'Erreur serveur', utilisateur: req.session.utilisateur });
  }
});

app.post('/admin/activation-queue/:id/retry', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const connexion = await pool.getConnection();
    await connexion.execute("UPDATE activation_queue SET status = 'pending', tentatives = 0, result_message = NULL WHERE id = ?", [id]);
    await connexion.execute('INSERT INTO journaux_systeme (utilisateur_id, action, nom_table, adresse_ip) VALUES (?, ?, ?, ?)', [req.session.utilisateur.id, 'ACTIVATION_QUEUE_RETRY', 'activation_queue', req.ip]);
    await connexion.release();
    res.redirect('/admin/activation-queue');
  } catch (err) {
    console.error('Erreur retry job:', err);
    res.status(500).render('erreur', { erreur: 'Erreur serveur', utilisateur: req.session.utilisateur });
  }
});

app.post('/admin/activation-queue/:id/process', requiertAdministrateur, csrfProtection, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Fetch job
    const connexion = await pool.getConnection();
    const [rows] = await connexion.execute('SELECT * FROM activation_queue WHERE id = ?', [id]);
    if (rows.length === 0) {
      await connexion.release();
      return res.status(404).render('erreur', { erreur: 'Job non trouvé', utilisateur: req.session.utilisateur });
    }
  // Mark as processing
  await connexion.execute("UPDATE activation_queue SET status = 'processing', tentatives = tentatives + 1 WHERE id = ?", [id]);
    await connexion.release();

    // Call worker to process this job directly
    const { processJobs } = require('./scripts/process_queue');
    await processJobs(10);
    res.redirect('/admin/activation-queue');
  } catch (err) {
    console.error('Erreur process job:', err);
    res.status(500).render('erreur', { erreur: 'Erreur serveur', utilisateur: req.session.utilisateur });
  }
});

// Page d'erreur générique
app.get('/erreur', (req, res) => {
  res.render('erreur', { 
    erreur: 'Une erreur s\'est produite',
    utilisateur: req.session.utilisateur 
  });
});

// Déconnexion
app.get('/deconnexion', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erreur lors de la déconnexion:', err);
    }
    res.redirect('/connexion');
  });
});

// Middleware de gestion d'erreurs
app.use((err, req, res, _next) => {
  console.error('Erreur serveur:', err);
  res.status(500).render('erreur', { 
    erreur: 'Erreur interne du serveur',
    utilisateur: req.session.utilisateur 
  });
});

// Route 404
app.use((req, res) => {
  res.status(404).render('erreur', { 
    erreur: 'Page non trouvée',
    utilisateur: req.session.utilisateur 
  });
});

// Démarrer le serveur
// Startup safety checks are handled by lib/env_safety.js (required by scripts)
app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📱 Accédez à l'application: http://localhost:${port}`);
    console.log(`� For local testing: set TEST_ADMIN_PASSWORD in your .env if you need to override the default test admin password.`);
  }
});

module.exports = app;