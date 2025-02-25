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

interface AlertData {
  type: "SIGNIFICANT_INCREASE" | "INCREASING_TREND" | "HIGH_UNASSIGNED_DAY";
  message: string;
  dates?: {
    previous: { start: string; end: string };
    current: { start: string; end: string };
  };
  previousAvg?: number;
  currentAvg?: number;
  data?: { date: string; percentage: number }[];
  day?: { date: string; percentage: number; sessions: number };
}

interface ResultData {
  status: string;
  isTest: boolean;
  alerts: AlertData[];
}

export default function TestAlertsPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testAlerts = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/ga4-alerts?test=true");

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: ResultData = await response.json();
      setResult(data);
    } catch (err: unknown) {
      // Corrected type here!
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue");
        console.error("An unknown error occurred:", err); // Log the unknown error
      }
    } finally {
      setLoading(false);
    }
  };

  const renderAlertDetails = (alert: AlertData) => {
    switch (alert.type) {
      case "SIGNIFICANT_INCREASE":
        return (
          <div className="mt-2 text-sm">
            <p>
              Période précédente ({alert.dates?.previous.start} à{" "}
              {alert.dates?.previous.end}): {alert.previousAvg}%
            </p>
            <p>
              Période actuelle ({alert.dates?.current.start} à{" "}
              {alert.dates?.current.end}): {alert.currentAvg}%
            </p>
          </div>
        );
      case "INCREASING_TREND":
        return (
          <div className="mt-2 text-sm">
            <p>Tendance des derniers jours:</p>
            <ul className="list-disc pl-5">
              {alert.data?.map((day, i) => (
                <li key={i}>
                  {day.date}: {day.percentage}%
                </li>
              ))}
            </ul>
          </div>
        );
      case "HIGH_UNASSIGNED_DAY":
        return (
          <div className="mt-2 text-sm">
            <p>
              Le {alert.day?.date}: {alert.day?.percentage}% (
              {alert.day?.sessions} sessions)
            </p>
          </div>
        );
      default:
        return null;
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
              variant={result.alerts.length > 0 ? "destructive" : "default"}
            >
              {result.alerts.length > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertTitle>{result.status}</AlertTitle>
              <AlertDescription>
                {result.isTest && "Test effectué avec des données simulées."}
              </AlertDescription>
            </Alert>

            {result.alerts.length > 0 && (
              <div className="space-y-3 mt-4">
                <h3 className="text-md font-medium">Alertes détectées:</h3>
                {result.alerts.map(
                  (
                    alert,
                    index // Key change: Type the alert!
                  ) => (
                    <div
                      key={index}
                      className="rounded-md border border-destructive/50 p-3"
                    >
                      <h4 className="font-medium text-destructive">
                        {alert.message}
                      </h4>
                      {renderAlertDetails(alert)}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
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
