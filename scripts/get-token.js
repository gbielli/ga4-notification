// scripts/get-token.js
const { OAuth2Client } = require("google-auth-library");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Lire les identifiants
const credentials = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "credentials", "oauth2.json"))
);

const oAuth2Client = new OAuth2Client(
  credentials.web.client_id,
  credentials.web.client_secret,
  "http://localhost:3001/oauth2callback"
);

// Générer et afficher l'URL d'authentification
const authorizeUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: "https://www.googleapis.com/auth/analytics.readonly",
  prompt: "consent",
});

console.log("Ouvrez cette URL dans votre navigateur pour vous authentifier:");
console.log(authorizeUrl);

// Créer un serveur pour recevoir le callback
const server = http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/oauth2callback")) {
        const url = new URL(req.url, "http://localhost:3001");
        const code = url.searchParams.get("code");

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "Authentification réussie! Vous pouvez fermer cette fenêtre."
          );

          const { tokens } = await oAuth2Client.getToken(code);
          console.log("Tokens obtenus avec succès!");

          fs.writeFileSync(
            path.join(process.cwd(), "credentials", "token.json"),
            JSON.stringify(tokens, null, 2)
          );

          console.log("Tokens sauvegardés dans credentials/token.json");

          // Arrêter le serveur après 1 seconde
          setTimeout(() => {
            server.close(() => console.log("Serveur arrêté"));
            process.exit(0);
          }, 1000);
        }
      }
    } catch (e) {
      console.error("Erreur:", e);
      res.end("Erreur: " + e.message);
    }
  })
  .listen(3001, () => {
    console.log("Serveur démarré sur http://localhost:3001");
    console.log("En attente de la redirection OAuth...");
  });
