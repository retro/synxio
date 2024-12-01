import { useSynxioCallEndpoint, Synxio } from "~/lib/synxio";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { GetAppTypeComponent } from "@repo/core";
import { Spinner } from "~/components/spinner";
import { siteNameToIcon, siteNameToTitle, SocialMediaSite } from "./util";
import { PostChat } from "./post-chat";
import Markdown from "react-markdown";
import { CircleCheckBig } from "lucide-react";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";

function PostCandidate({ post }: { post: string }) {
  return (
    <Markdown className="prose text-sm max-w-full w-full prose-invert">
      {post}
    </Markdown>
  );
}

function PostCandidates({
  postCandidates,
  onApprove,
}: {
  postCandidates: string[];
  onApprove: ((content: string) => void) | undefined;
}) {
  return (
    <div className="space-y-4">
      {postCandidates.map((post, idx) => (
        <div className="border rounded p-4 space-y-4">
          <PostCandidate key={idx} post={post} />
          <hr />
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={!onApprove}
              onClick={() => {
                if (onApprove) {
                  onApprove(post);
                }
              }}
            >
              Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PostWrapper({
  site,
  children,
  headerContentRight,
}: {
  site: SocialMediaSite;
  children: React.ReactNode;
  headerContentRight?: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div>{siteNameToIcon[site]}</div>
          <div className="text-md font-semibold">
            {siteNameToTitle[site]} Post
          </div>
        </div>
        {headerContentRight}
      </div>

      {children}
    </div>
  );
}

function PostRunning({
  component,
  site,
}: {
  component: GetAppTypeComponent<SocialMediaGeneratorApp, "Post">;
  site: SocialMediaSite;
}) {
  const callApprovalEndpoint = useSynxioCallEndpoint(
    component.endpoints.approval
  );
  const onApprove = useMemo(() => {
    if (!callApprovalEndpoint) {
      return undefined;
    }
    return (content: string) => {
      callApprovalEndpoint({ kind: "approval", content });
    };
  }, [callApprovalEndpoint]);

  return (
    <PostWrapper
      site={site}
      headerContentRight={<PostChat id={component.id} site={site} />}
    >
      {component.state.postCandidates.length > 0 ? (
        <PostCandidates
          postCandidates={component.state.postCandidates}
          onApprove={onApprove}
        />
      ) : (
        <Spinner />
      )}
    </PostWrapper>
  );
}

export function Post({ id, site }: { id: string; site: SocialMediaSite }) {
  return (
    <Synxio.Component
      name="Post"
      id={id}
      whenRunning={(component) => (
        <PostRunning component={component} site={site} />
      )}
      whenCompleted={(component) => {
        return (
          <PostWrapper
            site={site}
            headerContentRight={
              <div className="flex items-center text-xs gap-1 text-slate-400">
                <CircleCheckBig className="size-4" />
                <div className="font-semibold">Approved</div>
              </div>
            }
          >
            {component.state.approvedPost ? (
              <div className="border rounded p-4 space-y-4">
                <PostCandidate post={component.state.approvedPost} />
              </div>
            ) : null}
          </PostWrapper>
        );
      }}
    />
  );
}
