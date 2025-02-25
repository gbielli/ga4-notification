"use client";

import { AppSidebar } from "@/components/app-sidebar";
import TestAlertsPanel from "@/components/test-alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AlertTriangle } from "lucide-react";

export default function AlertsDashboardPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard/alerts">
                    Alertes GA4
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-col items-center p-6 space-y-8">
          <div className="flex flex-col items-center space-y-2 max-w-lg text-center">
            <AlertTriangle className="h-12 w-12 text-orange-500" />
            <h1 className="text-2xl font-bold">Système d&apos;alertes GA4</h1>
            <p className="text-muted-foreground">
              Ce système vérifie quotidiennement vos données Google Analytics
              pour détecter les anomalies dans le trafic non attribué et vous
              envoie un email si des conditions d&apos;alerte sont déclenchées.
            </p>
          </div>

          <TestAlertsPanel />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
