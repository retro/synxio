import { useSynxio, Synxio } from "~/lib/synxio";
import { Post } from "~/components/post";
import { GetAppTypeComponent } from "@repo/core";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";

function PostsContent({
  component,
}: {
  component: GetAppTypeComponent<
    SocialMediaGeneratorApp,
    "SocialMediaGenerator"
  >;
}) {
  const { components } = component;
  const potentialComponents = [
    components.InstagramPost,
    components.FacebookPost,
    components.TwitterPost,
  ].filter(Boolean);

  if (!potentialComponents.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold">Posts</h2>
      <div className="space-y-4">
        {components.TwitterPost ? (
          <Post id={components.TwitterPost} site="twitter" />
        ) : null}
        {components.FacebookPost ? (
          <Post id={components.FacebookPost} site="facebook" />
        ) : null}
        {components.InstagramPost ? (
          <Post id={components.InstagramPost} site="instagram" />
        ) : null}
      </div>
    </div>
  );
}

export function Posts() {
  return (
    <Synxio.Component
      name="SocialMediaGenerator"
      whenRunning={(component) => <PostsContent component={component} />}
      whenCompleted={(component) => <PostsContent component={component} />}
    />
  );
}
