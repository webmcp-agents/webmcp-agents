// The TanStack Router plugin generates this file in a real project.
// This cut-down copy lets the routes here type-check; the docs never
// show it.
import type {} from "@tanstack/react-start";

import type { Route as rootRoute } from "./routes/__root";
import type { Route as ApiChatRoute } from "./routes/api/chat";
import type { Route as ApiTelemetry } from "./routes/api/telemetry";
import type { Route as IndexRoute } from "./routes/index";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      id: "/";
      path: "/";
      fullPath: "/";
      preLoaderRoute: typeof IndexRoute;
      parentRoute: typeof rootRoute;
    };
    "/api/chat": {
      id: "/api/chat";
      path: "/api/chat";
      fullPath: "/api/chat";
      preLoaderRoute: typeof ApiChatRoute;
      parentRoute: typeof rootRoute;
    };
    "/api/telemetry": {
      id: "/api/telemetry";
      path: "/api/telemetry";
      fullPath: "/api/telemetry";
      preLoaderRoute: typeof ApiTelemetry;
      parentRoute: typeof rootRoute;
    };
  }
}
