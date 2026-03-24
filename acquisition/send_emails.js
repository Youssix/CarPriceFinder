#!/usr/bin/env node
/**
 * Envoi cold emails J0 — Carlytics
 * Usage : SMTP_PASS=xxx node acquisition/send_emails.js [--dry-run]
 */

const nodemailer = require('nodemailer');
const readline = require('readline');

const DRY_RUN = process.argv.includes('--dry-run');
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_PASS && !DRY_RUN) {
  console.error('❌ Manque le mot de passe SMTP : SMTP_PASS=xxx node acquisition/send_emails.js');
  process.exit(1);
}


// ─── Bannière email (base64, ~16KB) ─────────────────────────────────────────
const BANNER_B64 = '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AREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQFVFVRUUVVFREVVUREERVEHHCYXJMKDjhXCuEwmlTCmFywmFdDjhTC54UwpoccJhcsKYTQ44TC5YUwppHHCmFywiDjhMK4TCg44TC5KIOKqqKCKoqqgiKoCIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIioqqiqoKqKqioiIoiKoCIqqIqiICIiCIqiDiiqigmEVwogmFMLkooIoqigiiqIjimFUUBEVQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERUVVcVVRVVEQVVRVVVRRVAVURUVERAREQERRAREQRERQRRVRAUVUUBRVRRBERQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQFVEVHJFFVRUUVVFRREVyRREFVyuKqouUyplEBEUQVREUBREQFERRBREQRERQERFAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREVFREQVERUVERUFURFMoiICIiBlERBEREBREUQUREUURFEERFAREQEREBERAREQEREBERAREQf/2Q==';

// ─── Liste des 15 emails J0 ───────────────────────────────────────────────

const EMAILS = [
  {
    to: 'rs-autos@live.fr',
    garage: 'RS Autos',
    prenom: 'Romain',
  },
  {
    to: 'negoceauto80@hotmail.fr',
    garage: 'Négoce Auto 80',
    prenom: 'Hafid',
  },
  {
    to: 'cerdan.auto@gmail.com',
    garage: 'Cerdan Auto',
    prenom: 'Toni',
  },
  {
    to: 'contact@autoconfiance.com',
    garage: 'Auto Confiance 25',
    prenom: null,
  },
  {
    to: 'contact.atelier@glinche-automobiles.com',
    garage: 'Glinche Automobiles',
    prenom: null,
  },
  {
    to: 'espace.central.auto@orange.fr',
    garage: 'Espace Central Auto',
    prenom: null,
  },
  {
    to: 'contact@autostock-montpellier.com',
    garage: 'Auto Stock Montpellier',
    prenom: null,
  },
  {
    to: 'contact@sovoautomobiles.fr',
    garage: 'SO.V.O Automobiles',
    prenom: null,
  },
  {
    to: 'contact@centrevoapro.com',
    garage: 'Centre VO@PRO',
    prenom: null,
  },
  {
    to: 'mvo@mvofrance.fr',
    garage: 'MVO France',
    prenom: null,
  },
  {
    to: 'languedocautonegoce@gmail.com',
    garage: 'Languedoc Auto Négoce',
    prenom: null,
  },
  {
    to: 'contact@acces-automobiles.fr',
    garage: 'Acces Automobiles',
    prenom: null,
  },
  {
    to: 'villet.automobiles@gmail.com',
    garage: 'Automobiles Bernard Villet',
    prenom: null,
  },
  {
    to: 'contact@mions-car.com',
    garage: 'Mions Car',
    prenom: null,
  },
  {
    to: 'contact@autostock95.com',
    garage: 'Auto Stock 95',
    prenom: null,
  },
];

// ─── Génération du corps email ────────────────────────────────────────────

function buildEmail(contact) {
  const salutation = contact.prenom ? `Bonjour ${contact.prenom},` : 'Bonjour,';

  const text = `${salutation}

Je me permets de vous contacter car ${contact.garage} achète des véhicules sur Auto1 ou BCA Auto Enchères.

Une question rapide : combien de temps passez-vous à vérifier les prix LeBonCoin avant de valider un achat ? La plupart des marchands que je croise y passent 15-20 min par véhicule.

On a développé un outil Chrome qui fait cette comparaison automatiquement, directement sur la page Auto1 et BCA Auto Enchères. Vous voyez la marge estimée en temps réel, sans quitter votre écran.

Gratuit pour tester, sans carte bancaire.

Testez gratuitement : carlytics.fr

Ça vous parle ?

--
Mustapha — Fondateur
contact@carlytics.fr | 06 78 30 30 02
carlytics.fr`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff;">
<div style="max-width:600px;padding:32px 24px;">

  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">${salutation}</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">Je me permets de vous contacter car <strong>${contact.garage}</strong> achète des véhicules sur Auto1 ou BCA Auto Enchères.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">Une question rapide : combien de temps passez-vous à vérifier les prix LeBonCoin avant de valider un achat ? La plupart des marchands que je croise y passent 15-20 min par véhicule.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">On a développé un outil Chrome qui fait cette comparaison automatiquement, directement sur la page Auto1 et BCA Auto Enchères. Vous voyez la marge estimée en temps réel, sans quitter votre écran.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 14px;">Gratuit pour tester, sans carte bancaire.</p>
  <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 8px;">Testez gratuitement : <a href="https://carlytics.fr" style="color:#1a73e8;">carlytics.fr</a></p>
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
    <tr>
      <td colspan="2" style="padding-top:16px;">
        <a href="https://carlytics.fr">
          <img src="data:image/jpeg;base64,${BANNER_B64}" width="520" alt="Carlytics" style="display:block;border-radius:8px;"/>
        </a>
      </td>
    </tr>
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

function showPreview() {
  console.log('\n' + '═'.repeat(60));
  console.log(`📧 COLD EMAIL J0 — ${EMAILS.length} emails à envoyer`);
  console.log('   Expéditeur : contact@carlytics.fr');
  console.log('   Objet      : Vous achetez sur Auto1 ?');
  if (DRY_RUN) console.log('   MODE       : 🔍 DRY RUN (aucun email envoyé)');
  console.log('═'.repeat(60));

  EMAILS.forEach((e, i) => {
    const label = e.prenom ? `${e.prenom} (${e.garage})` : e.garage;
    console.log(`  ${String(i + 1).padStart(2, ' ')}. ${e.to.padEnd(42, ' ')} — ${label}`);
  });

  console.log('═'.repeat(60));
  console.log('\nAperçu du premier email :');
  console.log('─'.repeat(40));
  console.log(buildEmail(EMAILS[0]).text);
  console.log('─'.repeat(40));
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

// ─── Envoi avec délai ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendAll() {
  showPreview();

  if (!DRY_RUN) {
    const answer = await confirm('\n⚠️  Confirmer l\'envoi des 15 emails ? (oui/non) : ');
    if (answer !== 'oui') {
      console.log('❌ Envoi annulé.');
      process.exit(0);
    }
  } else {
    console.log('\n🔍 DRY RUN — simulation uniquement, aucun email envoyé.\n');
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < EMAILS.length; i++) {
    const contact = EMAILS[i];
    const { text, html } = buildEmail(contact);

    if (DRY_RUN) {
      console.log(`✓ [DRY] ${contact.to}`);
      continue;
    }

    try {
      await transporter.sendMail({
        from: '"Mustapha — Carlytics" <contact@carlytics.fr>',
        to: contact.to,
        bcc: 'contact@carlytics.fr',
        subject: 'Vous achetez sur Auto1 ?',
        text,
        html,
      });
      console.log(`✅ ${String(i + 1).padStart(2, ' ')}/15 envoyé  → ${contact.to}`);
      success++;

      // Délai 8-12s entre chaque email (anti-spam)
      if (i < EMAILS.length - 1) {
        const delay = 8000 + Math.floor(Math.random() * 4000);
        await sleep(delay);
      }
    } catch (err) {
      console.error(`❌ ${String(i + 1).padStart(2, ' ')}/15 ERREUR  → ${contact.to} : ${err.message}`);
      failed++;
    }
  }

  if (!DRY_RUN) {
    console.log('\n' + '═'.repeat(60));
    console.log(`📊 Résultat : ${success} envoyés, ${failed} échecs`);
    console.log('   Prochaine étape : relances J+3 jeudi 19 mars');
    console.log('═'.repeat(60));
  }
}

sendAll().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
