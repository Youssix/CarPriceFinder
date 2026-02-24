const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'Carlytics <noreply@carlytics.fr>';

async function sendAuthCode(email, code) {
  if (!resend) {
    console.log(`[📧 Email] No RESEND_API_KEY set. Code for ${email}: ${code}`);
    return { success: true, fallback: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${code} - Votre code de connexion Carlytics`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">Carlytics</h1>
            <p style="color: #6b7280; margin-top: 4px;">Trouvez les meilleures affaires VO</p>
          </div>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <p style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">Votre code de connexion :</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a2e; font-family: monospace;">
              ${code}
            </div>
          </div>

          <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0;">
            Ce code expire dans <strong>10 minutes</strong>.<br>
            Si vous n'avez pas demande ce code, ignorez cet email.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
            Carlytics - L'outil d'analyse de prix pour les professionnels VO
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[📧 Email] Resend error:', error);
      return { success: false, error };
    }

    console.log(`[📧 Email] Auth code sent to ${email} (id: ${data.id})`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[📧 Email] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendAlertNotification(email, matches) {
  if (!resend) {
    console.log(`[📧 Email] No RESEND_API_KEY. ${matches.length} alert matches for ${email}`);
    return { success: true, fallback: true };
  }

  const matchRows = matches.map(m => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${m.brand} ${m.model}</strong> (${m.year})
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${m.km ? (m.km).toLocaleString('fr-FR') + ' km' : '—'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${m.auto1_price ? m.auto1_price.toLocaleString('fr-FR') + ' €' : '—'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${m.lbc_median_price ? m.lbc_median_price.toLocaleString('fr-FR') + ' €' : '—'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: ${m.margin >= 2000 ? '#16a34a' : m.margin >= 500 ? '#ca8a04' : '#dc2626'}; font-weight: 600;">
        +${m.margin ? m.margin.toLocaleString('fr-FR') : 0} €
      </td>
    </tr>
  `).join('');

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `🚗 ${matches.length} nouveau${matches.length > 1 ? 'x' : ''} deal${matches.length > 1 ? 's' : ''} detecte${matches.length > 1 ? 's' : ''} - Carlytics`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Nouveaux deals detectes</h1>
            <p style="color: #6b7280; margin-top: 4px;">${matches.length} vehicule${matches.length > 1 ? 's' : ''} correspon${matches.length > 1 ? 'dent' : 'd'} a vos alertes</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background: #1a1a2e; color: white;">
                <th style="padding: 12px; text-align: left;">Vehicule</th>
                <th style="padding: 12px; text-align: left;">KM</th>
                <th style="padding: 12px; text-align: left;">Auto1</th>
                <th style="padding: 12px; text-align: left;">LBC</th>
                <th style="padding: 12px; text-align: left;">Marge</th>
              </tr>
            </thead>
            <tbody>
              ${matchRows}
            </tbody>
          </table>

          <div style="text-align: center; margin-top: 24px;">
            <a href="https://app.carlytics.fr" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Voir sur le dashboard
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
            Carlytics - L'outil d'analyse de prix pour les professionnels VO<br>
            <a href="https://app.carlytics.fr/settings" style="color: #9ca3af;">Gerer vos alertes</a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[📧 Email] Alert notification error:', error);
      return { success: false, error };
    }

    console.log(`[📧 Email] Alert notification sent to ${email} (${matches.length} matches)`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[📧 Email] Alert send failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendWelcomeEmail(email, apiKey) {
  if (!resend) {
    console.log(`[📧 Email] No RESEND_API_KEY. Welcome email for ${email}`);
    return { success: true, fallback: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Bienvenue sur Carlytics ! Votre cle API',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">Bienvenue sur Carlytics !</h1>
          </div>

          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Votre compte est actif. Voici votre cle API pour l'extension Chrome :
          </p>

          <div style="background: #1a1a2e; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <code style="color: #3b82f6; font-size: 14px; word-break: break-all;">${apiKey}</code>
          </div>

          <h3 style="color: #1a1a2e;">Pour commencer :</h3>
          <ol style="color: #374151; line-height: 1.8;">
            <li>Installez l'extension Chrome CarPriceFinder</li>
            <li>Collez votre cle API dans les parametres de l'extension</li>
            <li>Naviguez sur Auto1.com — les analyses de prix apparaissent automatiquement</li>
            <li>Consultez votre <a href="https://app.carlytics.fr" style="color: #3b82f6;">dashboard</a> pour suivre vos deals</li>
          </ol>

          <div style="text-align: center; margin-top: 32px;">
            <a href="https://app.carlytics.fr" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Acceder au dashboard
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Carlytics - L'outil d'analyse de prix pour les professionnels VO
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[📧 Email] Welcome error:', error);
      return { success: false, error };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('[📧 Email] Welcome send failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendAuthCode, sendAlertNotification, sendWelcomeEmail };
