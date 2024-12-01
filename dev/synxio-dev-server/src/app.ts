import { App, GetAppType } from "@repo/core";
import { SocialMediaGenerator } from "./components/social-media-generator.js";
import { Effect } from "effect";

export const SocialMediaGeneratorApp = App.build(
  SocialMediaGenerator,
  (
    userPayload:
      | "editor"
      | "facebookEditor"
      | "instagramEditor"
      | "twitterEditor",
    component
  ) =>
    Effect.gen(function* () {
      switch (component.name) {
        case "Post": {
          return (
            userPayload === "editor" ||
            (userPayload === "facebookEditor" &&
              component.payload.site === "facebook") ||
            (userPayload === "instagramEditor" &&
              component.payload.site === "instagram") ||
            (userPayload === "twitterEditor" &&
              component.payload.site === "twitter")
          );
        }
        default:
          return true;
      }
    })
);

export type SocialMediaGeneratorApp = GetAppType<typeof SocialMediaGenerator>;
