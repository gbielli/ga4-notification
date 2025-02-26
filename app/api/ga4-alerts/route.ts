// app/api/ga4-alerts/route.ts
import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";
import { Resend } from "resend";

// Définir les interfaces pour les données GA4
interface GA4Row {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

interface GA4Data {
  rows?: GA4Row[];
}

// Initialiser le client Resend pour l'envoi d'emails s'il y a une clé API
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

export async function GET(req: Request) {
  try {
    // Vérifier si nous sommes en mode test
    const url = new URL(req.url);
    const isTestMode = url.searchParams.get("test") === "true";
    const simulateNoOrganic = url.searchParams.get("noOrganic") === "true";

    // Vérifier l'autorisation
    const authHeader = req.headers.get("authorization");
    if (!isTestMode && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let totalSessions = 0;
    let organicSessions = 0;

    if (isTestMode) {
      console.log("Mode test activé - utilisation de données simulées");
      // Générer des données de test
      totalSessions = Math.floor(Math.random() * 1000) + 500; // Entre 500 et 1500 sessions

      // Si simulateNoOrganic est true, on simule l'absence de trafic organique
      organicSessions = simulateNoOrganic ? 0 : Math.floor(totalSessions * 0.4); // 40% du trafic est organique
    } else {
      // Mode normal: Connexion à GA4 et récupération des données réelles
      // 1. Récupérer les credentials depuis les variables d'environnement
      const credentials = JSON.parse(
        process.env.GOOGLE_OAUTH2_CREDENTIALS || "{}"
      );
      if (!credentials.web) {
        throw new Error("Les credentials OAuth2 sont invalides ou manquants");
      }

      // 2. Récupérer le token depuis les variables d'environnement
      const token = JSON.parse(process.env.GOOGLE_OAUTH2_TOKEN || "{}");
      if (!token.refresh_token) {
        throw new Error("Le token OAuth2 est invalide ou manquant");
      }

      // 3. Créer un client OAuth2
      const oauth2Client = new OAuth2Client(
        credentials.web.client_id,
        credentials.web.client_secret,
        "http://localhost:3001/oauth2callback"
      );

      // 4. Définir les tokens
      oauth2Client.setCredentials(token);

      // 5. Obtenir un nouveau token d'accès si nécessaire
      const tokens = await oauth2Client.getAccessToken();
      const accessToken = tokens.token;

      // 6. ID de votre propriété GA4
      const propertyId = process.env.GA_PROPERTY_ID || "470974790";

      // 7. Requête à l'API GA4 pour obtenir les données des dernières 24 heures
      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateRanges: [
              {
                startDate: "yesterday",
                endDate: "yesterday",
              },
            ],
            dimensions: [
              {
                name: "sessionDefaultChannelGroup",
              },
            ],
            metrics: [
              {
                name: "sessions",
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API GA4 (${response.status}): ${errorText}`);
      }

      // 8. Récupérer les données
      const data: GA4Data = await response.json();

      // 9. Extraire les statistiques
      if (data.rows) {
        data.rows.forEach((row: GA4Row) => {
          const channel = row.dimensionValues[0].value;
          const sessions = parseInt(row.metricValues[0].value);

          totalSessions += sessions;

          if (channel === "Organic Search") {
            organicSessions = sessions;
          }
        });
      }
    }

    // 10. Préparer l'email selon les résultats
    let emailSubject, emailContent;

    // Si trafic organique > 1, c'est un rapport normal
    const hasOrganic = organicSessions > 1;

    if (hasOrganic) {
      emailSubject = `📊 Rapport GA4 quotidien - ${new Date().toLocaleDateString()}`;
      emailContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #2e7d32;">📊 Rapport quotidien GA4</h2>
          <p>Voici votre rapport quotidien des performances de votre site web:</p>

          <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #4caf50; background-color: #e8f5e9;">
            <h3 style="margin-top: 0; color: #2e7d32;">Rapport quotidien: ${totalSessions} sessions au total (${organicSessions} organiques)</h3>
            <p>Voici un récapitulatif de votre trafic pour hier:</p>
            <ul>
              <li>Sessions totales: ${totalSessions}</li>
              <li>Sessions organiques: ${organicSessions}</li>
            </ul>
            <p>Statut du tracking: <strong style="color: #2e7d32">✓ Opérationnel</strong></p>
          </div>
          
          <p>Tout semble fonctionner correctement. Si vous souhaitez analyser plus en détail vos données:</p>
          <ul>
            <li>Consultez votre tableau de bord Google Analytics</li>
            <li>Vérifiez les performances de vos campagnes marketing</li>
          </ul>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Cette notification est générée automatiquement par votre système de monitoring GA4.</p>
            ${
              isTestMode
                ? "<p><strong>Ceci est un test</strong> - Aucun problème réel n'a été détecté.</p>"
                : ""
            }
          </div>
        </div>
      `;
    } else {
      // Alerte si pas de trafic organique
      emailSubject = `⚠️ Alerte GA4 - Aucun trafic organique - ${new Date().toLocaleDateString()}`;
      emailContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #d32f2f;">⚠️ Alerte GA4</h2>
          <p>Notre système a détecté qu'il n'y a pas de trafic organique sur votre site.</p>

          <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #f44336; background-color: #ffebee;">
            <h3 style="margin-top: 0; color: #d32f2f;">Aucun trafic organique détecté</h3>
            <p>Statistiques de la journée d'hier:</p>
            <ul>
              <li>Sessions totales: ${totalSessions}</li>
              <li>Sessions organiques: ${organicSessions}</li>
            </ul>
          </div>
          
          <p>Nous vous recommandons de vérifier:</p>
          <ul>
            <li>Que votre site est correctement indexé par les moteurs de recherche</li>
            <li>Que le tag Google Analytics est correctement implémenté</li>
          </ul>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Cette alerte est générée automatiquement par votre système de monitoring GA4.</p>
            ${
              isTestMode
                ? "<p><strong>Ceci est un test</strong> - Aucun problème réel n'a été détecté.</p>"
                : ""
            }
          </div>
        </div>
      `;
    }

    // Envoyer l'email seulement si ce n'est pas un test ou si envoi de test explicitement demandé
    const sendTestEmail = url.searchParams.get("sendEmail") === "true";
    let emailSent = false;

    if ((!isTestMode || sendTestEmail) && resend) {
      try {
        const emailTo = process.env.ALERT_EMAIL || "guillaume.bielli@gmail.com";
        await resend.emails.send({
          from: "hello@guillaumebielli.fr",
          to: emailTo,
          subject: emailSubject,
          html: emailContent,
        });
        emailSent = true;
        console.log(`Email envoyé à ${emailTo}`);
      } catch (emailError) {
        console.error("Erreur lors de l'envoi de l'email:", emailError);
        // On continue le processus même si l'email échoue
      }
    } else if (!resend && (sendTestEmail || !isTestMode)) {
      console.log(
        "Aucune clé API Resend configurée, l'email n'a pas été envoyé"
      );
    }

    return NextResponse.json({
      status: hasOrganic
        ? `Rapport quotidien ${emailSent ? "envoyé" : "généré"}`
        : `Alerte ${emailSent ? "envoyée" : "générée"}: aucun trafic organique`,
      data: {
        totalSessions,
        organicSessions,
        isTest: isTestMode,
        emailSent,
        emailConfigured: !!resend,
      },
    });
  } catch (error) {
    console.error("Erreur:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
