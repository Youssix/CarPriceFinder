#!/usr/bin/env node
/**
 * Envoi cold emails — Liste Even Blieck (clients Auto1)
 * 227 contacts extraits du CC d'Even Blieck (commercial Auto1)
 *
 * Usage :
 *   SMTP_PASS=xxx node acquisition/send_emails_blieck.js [--dry-run] [--batch N] [--offset N]
 *
 * Options :
 *   --dry-run   Simule l'envoi sans rien envoyer
 *   --batch N   Nombre d'emails par session (défaut: 50)
 *   --offset N  Commencer à partir du contact N (défaut: 0)
 *
 * Exemples :
 *   node send_emails_blieck.js --dry-run                    # Preview tous les contacts
 *   SMTP_PASS=xxx node send_emails_blieck.js --batch 50     # Envoie les 50 premiers
 *   SMTP_PASS=xxx node send_emails_blieck.js --batch 50 --offset 50   # Envoie 51-100
 *   SMTP_PASS=xxx node send_emails_blieck.js --batch 50 --offset 100  # Envoie 101-150
 */

const nodemailer = require('nodemailer');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ─── Args ─────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SMTP_PASS = process.env.SMTP_PASS;
const BATCH = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--batch') || '50');
const OFFSET = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--offset') || '0');

if (!SMTP_PASS && !DRY_RUN) {
  console.error('❌ Manque le mot de passe SMTP : SMTP_PASS=xxx node acquisition/send_emails_blieck.js');
  process.exit(1);
}

// ─── Bannière email (base64) ──────────────────────────────────────────────

const BANNER_PATH = path.join(__dirname, 'banner_email.jpg');
let BANNER_B64 = '';
if (fs.existsSync(BANNER_PATH)) {
  BANNER_B64 = fs.readFileSync(BANNER_PATH).toString('base64');
}

// ─── Lecture du CSV ───────────────────────────────────────────────────────

function loadContacts() {
  const csvPath = path.join(__dirname, 'contacts_auto1_blieck.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
  const contacts = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse (no quotes handling needed for our data)
    const parts = line.split(',');
    const email = parts[0]?.trim();
    const nom = parts[1]?.trim() || null;
    const garage = parts[2]?.trim() || null;

    if (email && email.includes('@')) {
      contacts.push({ email, nom, garage });
    }
  }

  return contacts;
}

// ─── Génération du corps email ────────────────────────────────────────────

function buildEmail(contact) {
  // Personnalisation : prenom > "Bonjour,"
  let prenom = null;
  if (contact.nom) {
    // Extraire le prénom (premier mot du nom)
    const parts = contact.nom.split(' ');
    prenom = parts[0];
    // Si c'est tout en majuscules (ex: "PHILIPPE AUTO"), c'est un nom de boîte, pas un prénom
    if (prenom === prenom.toUpperCase() && prenom.length > 3) {
      prenom = null;
    }
  }

  const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';

  // Utiliser le nom du garage si dispo, sinon phrase générique
  const introLine = contact.garage
    ? `Je me permets de vous contacter car <strong>${contact.garage}</strong> achète des véhicules sur Auto1.`
    : `Je me permets de vous contacter car vous achetez des véhicules sur Auto1.`;

  const introText = contact.garage
    ? `Je me permets de vous contacter car ${contact.garage} achète des véhicules sur Auto1.`
    : `Je me permets de vous contacter car vous achetez des véhicules sur Auto1.`;

  const text = `${salutation}

${introText}

Une question rapide : combien de temps passez-vous à vérifier les prix LeBonCoin avant de valider un achat ? La plupart des marchands que je croise y passent 15-20 min par véhicule.

On a développé un outil qui fait cette comparaison automatiquement, directement sur la page Auto1. Sur chaque annonce, vous voyez tout de suite si c'est une bonne affaire 🟢 ou pas 🔴, sans quitter votre écran.

L'indicateur est gratuit et illimité, sans carte bancaire. Les chiffres exacts (prix marché, marge en €) sont disponibles avec un abonnement.

Voici ce que ça donne (GIF animé dans l'email, ou lien) : carlytics.fr

Testez maintenant : carlytics.fr

Ça vous parle ?

--
Mustapha — Fondateur
contact@carlytics.fr | 06 78 30 30 02
carlytics.fr`;

  const bannerHtml = BANNER_B64
    ? `<tr>
      <td colspan="2" style="padding-top:16px;">
        <a href="https://carlytics.fr">
          <img src="data:image/jpeg;base64,${BANNER_B64}" width="520" alt="Carlytics" style="display:block;border-radius:8px;"/>
        </a>
      </td>
    </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff;">
<div style="max-width:600px;padding:32px 24px;">

  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">${salutation}</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">${introLine}</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">Une question rapide : combien de temps passez-vous à vérifier les prix LeBonCoin avant de valider un achat ? La plupart des marchands que je croise y passent 15-20 min par véhicule.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">On a développé un outil qui fait cette comparaison automatiquement, directement sur la page Auto1. Sur chaque annonce, vous voyez tout de suite si c'est une bonne affaire <span style="color:#16a34a;font-weight:bold;">🟢</span> ou pas <span style="color:#dc2626;font-weight:bold;">🔴</span>, sans quitter votre écran.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">L'indicateur est gratuit et illimité, sans carte bancaire. Les chiffres exacts (prix marché, marge en €) sont disponibles avec un abonnement.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 16px;">Voici ce que ça donne :</p>
  <a href="https://carlytics.fr" style="display:block;margin:0 0 16px;">
    <img src="https://carlytics.fr/demo.gif" width="520" alt="Démo Carlytics - analyse de marge en temps réel" style="display:block;border-radius:8px;max-width:100%;"/>
  </a>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 8px;">Testez maintenant : <a href="https://carlytics.fr" style="color:#1a73e8;">carlytics.fr</a></p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 28px;">Ça vous parle ?</p>

  <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 20px;">

  <table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding-right:16px;border-right:3px solid #1a73e8;vertical-align:middle;">
        <span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#111;letter-spacing:-0.5px;">Carl</span><span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#1a73e8;letter-spacing:-0.5px;">ytics</span>
      </td>
      <td style="padding-left:16px;vertical-align:top;line-height:1.6;">
        <div style="font-weight:bold;font-size:14px;color:#111;">Mustapha</div>
        <div style="color:#888;font-size:12px;margin-bottom:6px;">Fondateur</div>
        <div style="margin-bottom:2px;"><a href="mailto:contact@carlytics.fr" style="color:#1a73e8;text-decoration:none;font-size:13px;">contact@carlytics.fr</a></div>
        <div style="font-weight:bold;font-size:13px;color:#111;margin-bottom:6px;">06 78 30 30 02</div>
        <div><a href="https://carlytics.fr" style="color:#1a73e8;text-decoration:none;font-size:12px;">carlytics.fr</a></div>
      </td>
    </tr>
    ${bannerHtml}
  </table>

</div>
</body></html>`;

  return { text, html };
}

// ─── Config SMTP Hostinger ────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'contact@carlytics.fr',
    pass: SMTP_PASS || 'DRY_RUN_MODE',
  },
});

// ─── Affichage preview ────────────────────────────────────────────────────

function showPreview(contacts, total) {
  console.log('\n' + '='.repeat(60));
  console.log(`📧 COLD EMAIL — Liste Even Blieck (clients Auto1)`);
  console.log(`   Total contacts : ${total}`);
  console.log(`   Ce batch       : ${contacts.length} (offset ${OFFSET})`);
  console.log('   Expediteur     : contact@carlytics.fr');
  console.log('   Objet          : Vous achetez sur Auto1 ?');
  if (DRY_RUN) console.log('   MODE           : 🔍 DRY RUN (aucun email envoye)');
  console.log('='.repeat(60));

  contacts.forEach((c, i) => {
    const label = c.nom || c.garage || '—';
    const idx = OFFSET + i + 1;
    console.log(`  ${String(idx).padStart(3, ' ')}. ${c.email.padEnd(45, ' ')} ${label}`);
  });

  console.log('='.repeat(60));
  console.log('\nApercu du premier email :');
  console.log('-'.repeat(40));
  console.log(buildEmail(contacts[0]).text);
  console.log('-'.repeat(40));
}

// ─── Confirmation utilisateur ─────────────────────────────────────────────

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Envoi avec delai ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendAll() {
  const allContacts = loadContacts();
  const contacts = allContacts.slice(OFFSET, OFFSET + BATCH);

  if (contacts.length === 0) {
    console.log('❌ Aucun contact dans cette plage. Verifiez --offset et --batch.');
    process.exit(1);
  }

  showPreview(contacts, allContacts.length);

  if (!DRY_RUN) {
    const answer = await confirm(`\n⚠️  Confirmer l'envoi de ${contacts.length} emails ? (oui/non) : `);
    if (answer !== 'oui') {
      console.log('❌ Envoi annule.');
      process.exit(0);
    }
  } else {
    console.log('\n🔍 DRY RUN — simulation uniquement, aucun email envoye.\n');
  }

  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const { text, html } = buildEmail(contact);
    const idx = OFFSET + i + 1;

    if (DRY_RUN) {
      console.log(`✓ [DRY] ${String(idx).padStart(3)}. ${contact.email}`);
      continue;
    }

    try {
      await transporter.sendMail({
        from: '"Mustapha — Carlytics" <contact@carlytics.fr>',
        to: contact.email,
        bcc: 'contact@carlytics.fr',
        subject: 'Vous achetez sur Auto1 ?',
        text,
        html,
      });
      console.log(`✅ ${String(idx).padStart(3)}/${allContacts.length} envoye  → ${contact.email}`);
      success++;

      // Delai 8-15s entre chaque email (anti-spam)
      if (i < contacts.length - 1) {
        const delay = 8000 + Math.floor(Math.random() * 7000);
        process.stdout.write(`   ⏳ Pause ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
      }
    } catch (err) {
      console.error(`❌ ${String(idx).padStart(3)}/${allContacts.length} ERREUR  → ${contact.email} : ${err.message}`);
      failed++;
      errors.push({ email: contact.email, error: err.message });
    }
  }

  if (!DRY_RUN) {
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Resultat : ${success} envoyes, ${failed} echecs`);
    if (OFFSET + BATCH < allContacts.length) {
      const nextOffset = OFFSET + BATCH;
      console.log(`\n📌 Prochain batch :`);
      console.log(`   SMTP_PASS=xxx node acquisition/send_emails_blieck.js --batch ${BATCH} --offset ${nextOffset}`);
    } else {
      console.log(`\n✅ Tous les contacts ont ete traites !`);
    }
    if (errors.length > 0) {
      console.log(`\n❌ Erreurs :`);
      errors.forEach(e => console.log(`   ${e.email} : ${e.error}`));
    }
    console.log('='.repeat(60));
  }
}

sendAll().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
