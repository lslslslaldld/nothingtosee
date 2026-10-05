import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useParams } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProfilePage from "./components/ProfilePage";
import SharedAiPage from "./components/SharedAiPage";
import SvgAccessGate from "./components/SvgAccessGate";
import LegalReagreeModal from "./components/LegalReagreeModal";
import ActivityCaptchaModal from "./components/ActivityCaptchaModal";
import { isSvgShell } from "./lib/siteOrigin";

const queryClient = new QueryClient();
const Router = isSvgShell() ? HashRouter : BrowserRouter;
const AccountPage = lazy(() => import("./components/AccountPage"));

function AuthBoundary({ children }: { children: ReactNode }) {
  const { user, loading, requires2fa, mustSetup2fa } = useAuth({ syncSettings: false });
  if (loading) {
    return <div style={{ height: "100dvh", display: "grid", placeItems: "center", color: "#c5ccd8" }}>Loading account...</div>;
  }
  if (!user || requires2fa || mustSetup2fa) {
    return (
      <Suspense fallback={<div style={{ height: "100dvh" }} />}>
        <div style={{ height: "100dvh" }}>
          <AccountPage onNavigate={() => {}} />
        </div>
      </Suspense>
    );
  }
  return children;
}

function PublicProfileRoute() {
  const { username } = useParams();
  return <ProfilePage username={username || ""} />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <SvgAccessGate>
          <AuthBoundary>
            <LegalReagreeModal />
            <ActivityCaptchaModal />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/user/:username" element={<PublicProfileRoute />} />
              <Route path="/share/ai/:token" element={<SharedAiPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthBoundary>
        </SvgAccessGate>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
