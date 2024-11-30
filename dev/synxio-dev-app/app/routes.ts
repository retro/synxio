import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("social-media-generator/:appId", "routes/social-media-generator.tsx"),
] satisfies RouteConfig;
