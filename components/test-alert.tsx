import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

interface TestResult {
  status: string;
  data: {
    totalSessions: number;
    organicSessions: number;
    isTest: boolean;
    emailSent: boolean;
    emailConfigured: boolean;
  };
  error?: string;
}

export default function TestAlertsPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulateNoOrganic, setSimulateNoOrganic] = useState(false);
  const [sendTestEmail, setSendTestEmail] = useState(false);

  const testAlerts = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      // Construire l'URL avec les paramètres de test
      const endpoint = `/api/ga4-alerts?test=true&noOrganic=${simulateNoOrganic}&sendEmail=true`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue");
        console.error("An unknown error occurred:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Test des alertes GA4</CardTitle>
        <CardDescription>
          Testez le système d&apos;alertes avec des données simulées
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="mb-4 space-y-4">
            <Alert
              variant={
                result.status.includes("Alerte") ? "destructive" : "default"
              }
            >
              {result.status.includes("Alerte") ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertTitle>{result.status}</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-2">
                  <p>Sessions totales: {result.data.totalSessions}</p>
                  <p>Sessions organiques: {result.data.organicSessions}</p>
                  {!result.data.emailConfigured && (
                    <p className="text-amber-600 font-semibold">
                      Aucune clé API Resend configurée, l&apos;email n&apos;a
                      pas été envoyé.
                    </p>
                  )}
                  {result.data.emailConfigured && result.data.emailSent && (
                    <p className="text-green-600 font-semibold">
                      Un email de test a été envoyé à l&apos;adresse configurée.
                    </p>
                  )}
                  {result.data.emailConfigured &&
                    !result.data.emailSent &&
                    !sendTestEmail && (
                      <p className="text-slate-500">
                        Aucun email n&apos;a été envoyé (option non
                        sélectionnée).
                      </p>
                    )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="space-y-4 mt-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="no-organic"
              checked={simulateNoOrganic}
              onChange={(e) => setSimulateNoOrganic(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="no-organic" className="text-sm">
              Simuler l&apos;absence de trafic organique (déclenche une alerte)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="send-email"
              checked={sendTestEmail}
              onChange={(e) => setSendTestEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="send-email" className="text-sm">
              Envoyer un email de test réel
            </label>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={testAlerts} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Traitement en cours...
            </>
          ) : (
            "Tester les alertes maintenant"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
