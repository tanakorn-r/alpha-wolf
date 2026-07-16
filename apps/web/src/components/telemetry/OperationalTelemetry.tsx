import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { initializeTelemetry, trackPage } from "../../lib/telemetry";

export function OperationalTelemetry() {
  const location = useLocation();

  useEffect(() => {
    initializeTelemetry();
  }, []);

  useEffect(() => {
    trackPage(location.pathname);
  }, [location.pathname]);

  return null;
}
