import { Effect, pipe, Fiber, Array } from "effect";
import { Component, State } from "@repo/core";
import { KeyPoints } from "./key-points.js";
import { Post } from "./post.js";

/* Root component

- Gets the article from the user
- Generates key points from the article
- Spawns a component for each social media platform

*/

const SocialMediaGeneratorSetup = Component.setup("SocialMediaGenerator", {
  // Endpoints allow us to communicate with the outside world
  endpoints: {},
  // State is streamed to the frontend
  state: {
    keyPoints: State.make<string[]>(() => []),
    article: State.make<string | null>(() => null),
  },
  components: {
    KeyPoints,
    InstagramPost: Post,
    FacebookPost: Post,
    TwitterPost: Post,
  },
});

export const SocialMediaGenerator = SocialMediaGeneratorSetup.build(
  (
    { components, state },
    payload: {
      article: string;
      twitter: boolean;
      facebook: boolean;
      instagram: boolean;
    }
  ) =>
    Effect.gen(function* () {
      yield* State.update(state.article, payload.article);

      // Generate key points from the article
      const keyPoints = yield* components
        .KeyPoints({
          article: payload.article,
        })
        .pipe(Effect.andThen(Fiber.join));

      if (!keyPoints) {
        return;
      }

      // Spawn components for each selected social media platform
      const postComponents = pipe(
        [
          payload.twitter
            ? yield* components.TwitterPost({
                site: "twitter",
                keyPoints,
              })
            : null,
          payload.facebook
            ? yield* components.FacebookPost({
                site: "facebook",
                keyPoints,
              })
            : null,
          payload.instagram
            ? yield* components.InstagramPost({
                site: "instagram",
                keyPoints,
              })
            : null,
        ],
        Array.filter((component) => component !== null)
      );

      // Wait for all components to complete - workflow is done
      // You could call an API here to send the posts to your backend

      yield* Fiber.joinAll(postComponents);
    })
);
