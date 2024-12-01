import { Synxio } from "~/lib/synxio";

import { Spinner } from "~/components/spinner";
import { GetAppTypeComponent } from "@repo/core";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";

type KeyPointsComponent = GetAppTypeComponent<
  SocialMediaGeneratorApp,
  "KeyPoints"
>;

function KeyPointsList({ component }: { component: KeyPointsComponent }) {
  return (
    <ul className="list-disc ml-4 text-sm space-y-1">
      {component.state.keyPoints.map((k, idx) => {
        return <li key={idx}>{k}</li>;
      })}
    </ul>
  );
}

function KeyPointsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow p-4 space-y-4">
      <div className="space-y-1.5">
        <div className="font-semibold leading-none tracking-tight">
          Key points
        </div>
        <div className="text-sm text-muted-foreground">
          Key points extracted from the article
        </div>
      </div>
      <hr />
      {children}
    </div>
  );
}

export function KeyPoints() {
  return Synxio.Component({
    name: "KeyPoints",
    whenRunning: (component) => (
      <KeyPointsWrapper>
        <KeyPointsList component={component} />
        <Spinner />
      </KeyPointsWrapper>
    ),
    whenCompleted: (component) => (
      <KeyPointsWrapper>
        <KeyPointsList component={component} />
      </KeyPointsWrapper>
    ),
  });
}
