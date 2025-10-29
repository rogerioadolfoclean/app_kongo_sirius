const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mysqlCore = require('mysql2');
const { dbConfig } = require('../lib/config');
require('../lib/env_safety');

async function processExportJobs(limit = 5) {
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [jobs] = await conn.query("SELECT * FROM export_jobs WHERE status = 'pending' ORDER BY date_creation LIMIT ?", [limit]);
    if (jobs.length === 0) {
      console.log('No export jobs pending');
      await conn.end();
      return [];
    }

    const results = [];
    for (const job of jobs) {
      try {
        console.log('Processing export job', job.id);
        await conn.query('UPDATE export_jobs SET status = ?, date_modification = NOW() WHERE id = ?', ['processing', job.id]);

        // Build SQL
        let sql = 'SELECT id, nom_utilisateur, email, role, statut, date_creation FROM utilisateurs';
        const params = [];
        if (job.q) {
          sql += ' WHERE nom_utilisateur LIKE ? OR email LIKE ?';
          params.push(`%${job.q}%`, `%${job.q}%`);
        }
        sql += ' ORDER BY id DESC';

        // Determine job type from params (default to csv)
        let jobParams = {};
        try { jobParams = job.params ? JSON.parse(job.params) : {}; } catch (e) { jobParams = {}; }
        const jobType = (jobParams.type || 'csv').toLowerCase();

        // Ensure exports directory exists
        const exportsDir = path.join(__dirname, '..', 'exports');
        if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

        let outPath = null;
        if (jobType === 'pdf') {
          outPath = path.join(exportsDir, `utilisateurs_export_${job.id}.pdf`);
          // create a stream connection and PDF document
          const streamConn = mysqlCore.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            charset: dbConfig.charset
          });

          const PDFDocument = require('pdfkit');
          const writeStream = fs.createWriteStream(outPath);
          const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
          doc.pipe(writeStream);

          // layout
          const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
          const colWidths = {
            id: 40,
            nom: 140,
            email: 180,
            role: 80,
            statut: 60,
            created: pageWidth - (40 + 140 + 180 + 80 + 60)
          };

          function drawHeader() {
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('ID', { continued: true, width: colWidths.id });
            doc.text('Nom', { continued: true, width: colWidths.nom });
            doc.text('Email', { continued: true, width: colWidths.email });
            doc.text('Role', { continued: true, width: colWidths.role });
            doc.text('Statut', { continued: true, width: colWidths.statut });
            doc.text('Créé', { width: colWidths.created });
            doc.moveDown(0.25);
            doc.font('Helvetica').fontSize(10);
          }

          doc.fontSize(18).font('Helvetica-Bold').text('Liste des utilisateurs', { align: 'center' });
          doc.moveDown(0.5);
          drawHeader();
          doc.on('pageAdded', () => drawHeader());

          await new Promise((resolve, reject) => {
            const query = streamConn.query(sql, params);
            const qstream = query.stream({ highWaterMark: 5 });
            qstream.on('data', (row) => {
              const created = row.date_creation ? new Date(row.date_creation).toISOString().slice(0,19).replace('T',' ') : '';
              const colHeights = [];
              colHeights.push(doc.heightOfString(String(row.id || ''), { width: colWidths.id }));
              colHeights.push(doc.heightOfString(String(row.nom_utilisateur || ''), { width: colWidths.nom }));
              colHeights.push(doc.heightOfString(String(row.email || ''), { width: colWidths.email }));
              colHeights.push(doc.heightOfString(String(row.role || ''), { width: colWidths.role }));
              colHeights.push(doc.heightOfString(String(row.statut || ''), { width: colWidths.statut }));
              colHeights.push(doc.heightOfString(String(created), { width: colWidths.created }));
              const rowHeight = Math.max(...colHeights) + 4;

              if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();

              doc.text(String(row.id || ''), { continued: true, width: colWidths.id });
              doc.text(String(row.nom_utilisateur || ''), { continued: true, width: colWidths.nom });
              doc.text(String(row.email || ''), { continued: true, width: colWidths.email });
              doc.text(String(row.role || ''), { continued: true, width: colWidths.role });
              doc.text(String(row.statut || ''), { continued: true, width: colWidths.statut });
              doc.text(created, { width: colWidths.created });
              doc.moveDown(0.2);
            });
            qstream.on('end', () => {
              doc.end();
              writeStream.end();
              streamConn.end();
              resolve();
            });
            qstream.on('error', (err) => {
              try { doc.end(); } catch (e) {}
              writeStream.end();
              streamConn.end();
              reject(err);
            });
          });

          await conn.query('UPDATE export_jobs SET status = ?, file_path = ?, date_modification = NOW() WHERE id = ?', ['done', outPath, job.id]);
        } else {
          outPath = path.join(exportsDir, `utilisateurs_export_${job.id}.csv`);

          const streamConn = mysqlCore.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            charset: dbConfig.charset
          });

          const writeStream = fs.createWriteStream(outPath, { encoding: 'utf8' });
          // header
          writeStream.write('id,nom_utilisateur,email,role,statut,date_creation\n');

          await new Promise((resolve, reject) => {
            const query = streamConn.query(sql, params);
            const qstream = query.stream({ highWaterMark: 5 });
            qstream.on('data', (row) => {
              const line = [
                row.id,
                (row.nom_utilisateur || '').replace(/"/g, '""'),
                (row.email || '').replace(/"/g, '""'),
                (row.role || '').replace(/"/g, '""'),
                (row.statut || '').replace(/"/g, '""'),
                (row.date_creation || '')
              ].join(',') + '\n';
              writeStream.write(line);
            });
            qstream.on('end', () => {
              writeStream.end();
              streamConn.end();
              resolve();
            });
            qstream.on('error', (err) => {
              writeStream.end();
              streamConn.end();
              reject(err);
            });
          });

          // update job
          await conn.query('UPDATE export_jobs SET status = ?, file_path = ?, date_modification = NOW() WHERE id = ?', ['done', outPath, job.id]);
        }
        results.push({ id: job.id, status: 'done', file_path: outPath });
      } catch (err) {
        console.error('Error processing export job', job.id, err && err.message ? err.message : err);
        await conn.query('UPDATE export_jobs SET status = ?, result_message = ?, date_modification = NOW() WHERE id = ?', ['failed', (err.message || '').substring(0, 255), job.id]);
        results.push({ id: job.id, status: 'failed', error: err.message });
      }
    }

    await conn.end();
    return results;
  } catch (err) {
    console.error('processExportJobs error:', err);
    if (conn) await conn.end();
    throw err;
  }
}

if (require.main === module) {
  const limit = parseInt(process.argv[2] || '5', 10);
  processExportJobs(limit).then((res) => {
    console.log('Done:', res);
    process.exit(0);
  }).catch((e) => {
    console.error('Fatal:', e);
    process.exit(2);
  });
}

module.exports = { processExportJobs };
