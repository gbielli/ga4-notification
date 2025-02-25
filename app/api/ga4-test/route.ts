// app/api/channel-analysis/route.ts
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";
import path from "path";

export async function GET() {
  try {
    // 1. Lire le fichier d'identifiants OAuth2
    const credentialsPath = path.join(
      process.cwd(),
      "credentials",
      "oauth2.json"
    );
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

    // 2. Créer un client OAuth2
    const oauth2Client = new OAuth2Client(
      credentials.web.client_id,
      credentials.web.client_secret,
      "http://localhost:3001/oauth2callback"
    );

    // 3. Utiliser le token existant
    const tokenPath = path.join(process.cwd(), "credentials", "token.json");
    if (fs.existsSync(tokenPath)) {
      const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
      oauth2Client.setCredentials(token);
    } else {
      return NextResponse.json(
        {
          error: "Token non trouvé",
          message:
            "Vous devez d'abord obtenir un token via le flux d'autorisation OAuth2",
        },
        { status: 401 }
      );
    }

    // 4. Obtenir un nouveau token d'accès si nécessaire
    const tokens = await oauth2Client.getAccessToken();
    const accessToken = tokens.token;

    // 5. ID de votre propriété GA4
    const propertyId = "470974790";

    // 6. Faire la requête à l'API GA4 pour obtenir les sessions par canal
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
              startDate: "30daysAgo",
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

    // 7. Traiter la réponse
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API GA4 (${response.status}): ${errorText}`);
    }

    // 8. Formater les données
    const data = await response.json();

    // 9. Extraire et traiter les données pour l'affichage
    const formattedData = formatChannelData(data);

    // 10. Vérifier si des alertes sont nécessaires
    const alerts = checkForAlerts(formattedData);

    return NextResponse.json({
      data: formattedData,
      alerts,
      rawData: data,
    });
  } catch (error) {
    console.error("Erreur lors de la requête GA4:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Formatter les données pour l'affichage
function formatChannelData(data) {
  if (!data || !data.rows) {
    return { byDate: [], byChannel: {}, unassigned: [] };
  }

  // Regrouper par date
  const byDate = {};

  // Regrouper par canal
  const byChannel = {};

  // Données spécifiques au canal "unassigned"
  const unassigned = [];

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

  // Convertir byDate en tableau et trier par date
  const byDateArray = Object.entries(byDate)
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculer le pourcentage d'unassigned pour chaque jour
  unassigned.forEach((item) => {
    const dateData = byDate[item.date];
    if (dateData && dateData.total > 0) {
      item.percentage = ((item.sessions / dateData.total) * 100).toFixed(2);
    }
  });

  return {
    byDate: byDateArray,
    byChannel,
    unassigned: unassigned.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Vérifier si des alertes doivent être déclenchées
function checkForAlerts(formattedData) {
  const alerts = [];
  const { unassigned } = formattedData;

  // Alerte si plus de 5% de trafic unassigned sur l'un des 7 derniers jours
  const recentUnassigned = unassigned.slice(-7);

  recentUnassigned.forEach((day) => {
    if (parseFloat(day.percentage) > 5) {
      alerts.push({
        date: day.date,
        message: `Trafic non attribué élevé : ${day.percentage}% (${day.sessions} sessions)`,
        level: parseFloat(day.percentage) > 10 ? "high" : "medium",
      });
    }
  });

  // Alerte si tendance à la hausse du trafic unassigned sur 3 jours consécutifs
  if (unassigned.length >= 3) {
    for (let i = unassigned.length - 3; i < unassigned.length - 1; i++) {
      if (
        parseFloat(unassigned[i].percentage) >
          parseFloat(unassigned[i - 1].percentage) &&
        parseFloat(unassigned[i + 1].percentage) >
          parseFloat(unassigned[i].percentage)
      ) {
        alerts.push({
          date: `${unassigned[i - 1].date} à ${unassigned[i + 1].date}`,
          message: "Augmentation continue du trafic non attribué sur 3 jours",
          level: "high",
        });
        break;
      }
    }
  }

  return alerts;
}
