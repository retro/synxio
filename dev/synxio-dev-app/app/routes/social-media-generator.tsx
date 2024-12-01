import type { Route } from "./+types/social-media-generator";
import { Synxio } from "~/lib/synxio";
import { KeyPoints } from "~/components/key-points";
import { Posts } from "~/components/posts";
import { GetAppTypeComponent } from "@repo/core";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";
import { useAtomValue } from "jotai";
import { roleAtom } from "~/role";

function SocialMediaGeneratorInner({
  component,
}: {
  component: GetAppTypeComponent<
    SocialMediaGeneratorApp,
    "SocialMediaGenerator"
  >;
}) {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Social Media Post Generator</h1>
      <KeyPoints />
      <Posts />
      {component.status === "completed" ? "🎉 Done!" : null}
    </div>
  );
}

export default function SocialMediaGenerator({ params }: Route.ComponentProps) {
  const appId = params.appId;
  const role = useAtomValue(roleAtom);
  return (
    <Synxio.Provider appId={appId} token={role}>
      <Synxio.Component
        name="SocialMediaGenerator"
        whenRunning={(component) => (
          <SocialMediaGeneratorInner component={component} />
        )}
        whenCompleted={(component) => (
          <SocialMediaGeneratorInner component={component} />
        )}
      />
    </Synxio.Provider>
  );
}
