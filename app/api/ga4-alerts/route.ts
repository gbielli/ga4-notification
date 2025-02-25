// app/api/ga4-alerts/route.ts
import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";
import { Resend } from "resend";

// Définir les interfaces pour les données
interface ChannelData {
  byDate: Record<string, { total: number; channels: Record<string, number> }>;
  byChannel: Record<string, { total: number; dates: Record<string, number> }>;
  unassigned: Array<{
    date: string;
    sessions: number;
    users: number;
    percentage: number;
  }>;
}

interface Alert {
  type: string;
  message: string;
  [key: string]: unknown; // Pour les propriétés supplémentaires par type d'alerte
}

interface GA4ApiRow {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

interface GA4ApiResponse {
  rows: GA4ApiRow[];
}

// Initialiser le client Resend pour l'envoi d'emails
const resend = new Resend(process.env.RESEND_API_KEY);

// Seuil d'alerte pour l'augmentation du trafic unassigned (en pourcentage)
const UNASSIGNED_INCREASE_THRESHOLD = 10;

export async function GET(req: Request) {
  try {
    // Vérifier si nous sommes en mode test
    const isTestMode = req.url.includes("test=true");

    // Vérifier l'autorisation
    const authHeader = req.headers.get("authorization");
    if (!isTestMode && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let data: GA4ApiResponse;

    if (isTestMode) {
      // Utiliser des données de test pour forcer des alertes
      console.log("Mode test activé - utilisation de données simulées");
      data = generateTestData();
    } else {
      // Continuer avec la logique normale de connexion à GA4
      try {
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

        // 7. Requête à l'API GA4 pour obtenir les données des 14 derniers jours
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
                  startDate: "14daysAgo",
                  endDate: "yesterday",
                },
              ],
              dimensions: [
                {
                  name: "sessionDefaultChannelGroup",
                },
                {
                  name: "date",
                },
              ],
              metrics: [
                {
                  name: "sessions",
                },
                {
                  name: "activeUsers",
                },
              ],
              orderBys: [
                {
                  dimension: {
                    dimensionName: "date",
                  },
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
        data = await response.json();
      } catch (error) {
        console.error("Erreur lors de la récupération des données GA4:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Erreur inconnue";
        return NextResponse.json(
          {
            error: errorMessage,
            message:
              "Erreur lors de la récupération des données Google Analytics",
          },
          { status: 500 }
        );
      }
    }

    // Formater les données pour l'analyse
    const formattedData = formatChannelData(data);

    // Analyser les données pour détecter les augmentations significatives
    const alerts = checkForSignificantIncrease(formattedData.unassigned);

    // Si des alertes sont détectées, envoyer un email
    if (alerts.length > 0) {
      await sendAlertEmail(alerts);

      return NextResponse.json({
        status: "Alertes détectées et email envoyé",
        alerts,
        isTest: isTestMode,
      });
    }

    return NextResponse.json({
      status: "Aucune alerte détectée",
      alerts: [],
      isTest: isTestMode,
    });
  } catch (error) {
    console.error("Erreur lors de la vérification des alertes:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Générer des données de test qui déclencheront des alertes
function generateTestData(): GA4ApiResponse {
  // Date d'aujourd'hui
  const today = new Date();

  // Créer 14 jours de données avec un pattern qui déclenche des alertes
  const rows: GA4ApiRow[] = [];

  // Pour les 7 premiers jours, trafic unassigned bas (~2%)
  for (let i = 13; i >= 7; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = formatDate(date);

    // Ajouter ligne pour trafic total (channel: Direct)
    rows.push({
      dimensionValues: [{ value: "Direct" }, { value: dateStr }],
      metricValues: [
        { value: "980" }, // Sessions
        { value: "800" }, // Users
      ],
    });

    // Ajouter ligne pour trafic unassigned (bas)
    rows.push({
      dimensionValues: [{ value: "Unassigned" }, { value: dateStr }],
      metricValues: [
        { value: "20" }, // 2% des sessions sont unassigned
        { value: "15" }, // Users
      ],
    });
  }

  // Pour les 7 derniers jours, augmentation progressive du trafic unassigned
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = formatDate(date);

    // Ajouter ligne pour trafic total (channel: Direct)
    rows.push({
      dimensionValues: [{ value: "Direct" }, { value: dateStr }],
      metricValues: [
        { value: "950" }, // Sessions légèrement plus bas
        { value: "780" }, // Users
      ],
    });

    // Calculer un taux croissant d'unassigned pour créer une alerte
    // De 5% à 15% sur les 7 derniers jours
    const percentage = 5 + (6 - i) * 1.5;
    const unassignedSessions = Math.round(950 * (percentage / 100));

    // Ajouter ligne pour trafic unassigned (en augmentation)
    rows.push({
      dimensionValues: [{ value: "Unassigned" }, { value: dateStr }],
      metricValues: [
        { value: unassignedSessions.toString() },
        { value: Math.round(unassignedSessions * 0.8).toString() }, // Users
      ],
    });
  }

  return {
    rows: rows,
  };
}

// Formatter une date au format YYYYMMDD pour GA4
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

// Formatter les données pour l'analyse
function formatChannelData(data: GA4ApiResponse): ChannelData {
  if (!data || !data.rows) {
    return { byDate: {}, byChannel: {}, unassigned: [] };
  }

  // Regrouper par date
  const byDate: Record<
    string,
    { total: number; channels: Record<string, number> }
  > = {};

  // Regrouper par canal
  const byChannel: Record<
    string,
    { total: number; dates: Record<string, number> }
  > = {};

  // Données spécifiques au canal "unassigned"
  const unassigned: Array<{
    date: string;
    sessions: number;
    users: number;
    percentage: number;
  }> = [];

  data.rows.forEach((row) => {
    const channel = row.dimensionValues[0].value;
    const date = row.dimensionValues[1].value;
    const sessions = parseInt(row.metricValues[0].value);
    const users = parseInt(row.metricValues[1].value);

    // Format de date pour l'affichage (YYYYMMDD -> YYYY-MM-DD)
    const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
      6,
      8
    )}`;

    // Ajouter aux données par date
    if (!byDate[formattedDate]) {
      byDate[formattedDate] = { total: 0, channels: {} };
    }
    byDate[formattedDate].total += sessions;
    byDate[formattedDate].channels[channel] = sessions;

    // Ajouter aux données par canal
    if (!byChannel[channel]) {
      byChannel[channel] = { total: 0, dates: {} };
    }
    byChannel[channel].total += sessions;
    byChannel[channel].dates[formattedDate] = sessions;

    // Si le canal est "unassigned", ajouter aux données spécifiques
    if (channel.toLowerCase() === "unassigned") {
      unassigned.push({
        date: formattedDate,
        sessions,
        users,
        percentage: 0, // Sera calculé ci-dessous
      });
    }
  });

  // Calculer le pourcentage d'unassigned pour chaque jour
  unassigned.forEach((item) => {
    const dateData = byDate[item.date];
    if (dateData && dateData.total > 0) {
      item.percentage = parseFloat(
        ((item.sessions / dateData.total) * 100).toFixed(2)
      );
    }
  });

  return {
    byDate,
    byChannel,
    unassigned: unassigned.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Vérifier s'il y a une augmentation significative du trafic unassigned
function checkForSignificantIncrease(
  unassignedData: Array<{ date: string; sessions: number; percentage: number }>
): Alert[] {
  const alerts: Alert[] = [];

  // S'assurer qu'il y a suffisamment de données pour l'analyse
  if (unassignedData.length < 2) {
    return alerts;
  }

  // Trier les données par date
  const sortedData = [...unassignedData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Diviser les données en deux périodes pour comparaison
  const midpoint = Math.floor(sortedData.length / 2);
  const previousPeriod = sortedData.slice(0, midpoint);
  const currentPeriod = sortedData.slice(midpoint);

  // Calculer la moyenne du pourcentage pour chaque période
  const previousAvg =
    previousPeriod.reduce((sum, day) => sum + day.percentage, 0) /
    previousPeriod.length;
  const currentAvg =
    currentPeriod.reduce((sum, day) => sum + day.percentage, 0) /
    currentPeriod.length;

  // Calculer l'augmentation en pourcentage
  const increasePercent = ((currentAvg - previousAvg) / previousAvg) * 100;

  // Si l'augmentation dépasse le seuil, créer une alerte
  if (increasePercent >= UNASSIGNED_INCREASE_THRESHOLD) {
    alerts.push({
      type: "SIGNIFICANT_INCREASE",
      message: `Augmentation significative du trafic non attribué de ${increasePercent.toFixed(
        1
      )}% détectée`,
      previousAvg: previousAvg.toFixed(2),
      currentAvg: currentAvg.toFixed(2),
      dates: {
        previous: {
          start: previousPeriod[0].date,
          end: previousPeriod[previousPeriod.length - 1].date,
        },
        current: {
          start: currentPeriod[0].date,
          end: currentPeriod[currentPeriod.length - 1].date,
        },
      },
    });
  }

  // Vérifier les tendances alarmantes sur les 3 derniers jours
  const recentDays = sortedData.slice(-3);
  if (recentDays.length === 3) {
    if (
      recentDays[1].percentage > recentDays[0].percentage &&
      recentDays[2].percentage > recentDays[1].percentage &&
      recentDays[2].percentage > recentDays[0].percentage * 1.1 // Au moins 10% d'augmentation en 3 jours
    ) {
      alerts.push({
        type: "INCREASING_TREND",
        message: `Tendance à la hausse du trafic non attribué sur les 3 derniers jours`,
        data: recentDays,
      });
    }
  }

  // Vérifier les jours individuels avec un taux anormalement élevé
  const recentHighDays = sortedData
    .slice(-7) // Regarder les 7 derniers jours
    .filter((day) => day.percentage > 5); // Plus de 5% est considéré comme élevé

  if (recentHighDays.length > 0) {
    const highestDay = recentHighDays.reduce(
      (max, day) => (day.percentage > max.percentage ? day : max),
      recentHighDays[0]
    );

    alerts.push({
      type: "HIGH_UNASSIGNED_DAY",
      message: `Taux élevé de trafic non attribué le ${highestDay.date} (${highestDay.percentage}%)`,
      day: highestDay,
    });
  }

  return alerts;
}

// Envoyer un email d'alerte
async function sendAlertEmail(alerts: Alert[]): Promise<boolean> {
  const emailTo = process.env.ALERT_EMAIL || "guillaume.bielli@gmail.com";

  // Construire le contenu HTML de l'email
  let alertContent = alerts
    .map((alert) => {
      let details = "";

      if (alert.type === "SIGNIFICANT_INCREASE") {
        const dates = alert.dates as {
          previous: { start: string; end: string };
          current: { start: string; end: string };
        };

        details = `
        <p>Une augmentation significative du trafic non attribué a été détectée :</p>
        <ul>
          <li>Période précédente (${dates.previous.start} à ${dates.previous.end}): ${alert.previousAvg}%</li>
          <li>Période actuelle (${dates.current.start} à ${dates.current.end}): ${alert.currentAvg}%</li>
        </ul>
      `;
      } else if (alert.type === "INCREASING_TREND") {
        const data = alert.data as Array<{ date: string; percentage: number }>;
        details = `
        <p>Tendance à la hausse sur les derniers jours :</p>
        <ul>
          ${data
            .map((day) => `<li>${day.date}: ${day.percentage}%</li>`)
            .join("")}
        </ul>
      `;
      } else if (alert.type === "HIGH_UNASSIGNED_DAY") {
        const day = alert.day as {
          date: string;
          percentage: number;
          sessions: number;
        };
        details = `
        <p>Taux élevé détecté le ${day.date} avec ${day.percentage}% de trafic non attribué (${day.sessions} sessions)</p>
      `;
      }

      return `
      <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #f44336; background-color: #ffebee;">
        <h3 style="margin-top: 0; color: #d32f2f;">${alert.message}</h3>
        ${details}
      </div>
    `;
    })
    .join("");

  // Envoyer l'email via Resend
  try {
    console.log(`Envoi d'email à ${emailTo}`);

    await resend.emails.send({
      from: "hello@guillaumebielli.fr",
      to: emailTo,
      subject: `🚨 Alerte Analytics - Trafic non attribué - ${new Date().toLocaleDateString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #d32f2f;">⚠️ Alerte de trafic non attribué détectée</h2>
          <p>Notre système a détecté une ou plusieurs anomalies dans le trafic non attribué de votre propriété Google Analytics.</p>

          <div style="margin: 25px 0;">
            ${alertContent}
          </div>
          
          <p>Nous vous recommandons de vérifier les éléments suivants :</p>
          <ul>
            <li>Configuration des UTM dans vos campagnes</li>
            <li>Intégration des réseaux sociaux et des plateformes tierces</li>
            <li>Implémentation du tag de tracking Google Analytics</li>
          </ul>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Cette alerte est générée automatiquement par votre système de monitoring GA4.</p>
            <p>Pour désactiver ou configurer ces alertes, accédez à votre tableau de bord.</p>
          </div>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error("Erreur lors de l&apos;envoi de l&apos;email:", error);
    throw error;
  }
}
