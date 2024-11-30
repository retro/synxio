import type { Route } from "./+types/social-media-generator";
import { Welcome } from "../welcome/welcome";
import { useSynxio, useSynxioCallEndpoint, Synxio } from "~/lib/synxio";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "~/components/ui/form";
import { AnyEndpointRef, EndpointRef } from "@repo/core";

const PostFeedbackSchema = z.object({
  content: z.string().min(1),
});

type PostFeedbackSchema = z.infer<typeof PostFeedbackSchema>;

function PostFeedback({
  messageUrl,
  approvalUrl,
}: {
  messageUrl: EndpointRef<{
    readonly content: string;
    readonly kind: "message";
  }>;
  approvalUrl: EndpointRef<{
    readonly kind: "approval";
  }>;
}) {
  const callMessageEndpoint = useSynxioCallEndpoint(messageUrl);
  const callApprovalEndpoint = useSynxioCallEndpoint(approvalUrl);

  const form = useForm<PostFeedbackSchema>({
    resolver: zodResolver(PostFeedbackSchema),
  });

  const onSubmit = (data: PostFeedbackSchema) => {
    callMessageEndpoint({ kind: "message", content: data.content });
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Feedback</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Make it better" />
                </FormControl>
              </FormItem>
            )}
          ></FormField>
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                callApprovalEndpoint({ kind: "approval" });
              }}
            >
              Approve
            </Button>
            <Button type="submit">Submit Feedback</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function Post({ id, site }: { id: string; site: string }) {
  return (
    <Synxio.Component
      name="Post"
      id={id}
      whenRunning={(component) => {
        return (
          <div className="border rounded p-4 space-y-2">
            <h2 className="text-md font-bold">{site} Post</h2>
            <div>
              <div className="space-y-4">
                <div>{component.state.post}</div>
                {component.state.isLoading ? <Spinner /> : null}
                <hr />
                <PostFeedback
                  messageUrl={component.endpoints.message}
                  approvalUrl={component.endpoints.approval}
                />
              </div>
            </div>
          </div>
        );
      }}
      whenCompleted={(component) => {
        return (
          <div className="border rounded p-4 space-y-2">
            <h2 className="text-md font-bold">{site} Post</h2>
            <div>
              <div className="space-y-4">
                <div>{component.state.post}</div>
                <hr />
                <div>✅ Approved</div>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

function Posts() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component || component.status === "forbidden") {
    return null;
  }

  const { components } = component;
  const potentialComponents = [
    components.InstagramPost,
    components.FacebookPost,
    components.TwitterPost,
  ].filter(Boolean);

  if (!potentialComponents.length) {
    return null;
  }

  console.log(components);

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold">Posts</h2>
      <div className="space-y-4">
        {components.TwitterPost ? (
          <Post id={components.TwitterPost} site="Twitter" />
        ) : null}
        {components.FacebookPost ? (
          <Post id={components.FacebookPost} site="Facebook" />
        ) : null}
        {components.InstagramPost ? (
          <Post id={components.InstagramPost} site="Instagram" />
        ) : null}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-e-transparent align-[-0.125em] text-surface motion-reduce:animate-[spin_1.5s_linear_infinite] dark:text-red-700"
      role="status"
    >
      <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
        Loading...
      </span>
    </div>
  );
}

function GeneratingKeyPoints() {
  return Synxio.Component({
    name: "KeyPoints",
    whenRunning: (component) => (
      <div>
        <div className="flex gap-2 items-center bg-white rounded px-2 py-1 text-zinc-800">
          <Spinner />
          Generating key points...
        </div>
        <ul className="list-disc ml-4">
          {component.state.keyPoints.map((k, idx) => {
            return <li key={idx}>{k}</li>;
          })}
        </ul>
      </div>
    ),
  });
}

function KeyPoints({ keyPoints }: { keyPoints: string[] }) {
  if (!keyPoints.length) {
    return null;
  }
  return (
    <div>
      <h2 className="text-lg font-bold">Key Points</h2>
      <ul className="list-disc ml-4">
        {keyPoints.map((k, idx) => {
          return <li key={idx}>{k}</li>;
        })}
      </ul>
    </div>
  );
}

function SocialMediaGeneratorInner() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component) {
    return null;
  }

  if (component.status === "forbidden") {
    return <div>You are not authorized to access this component</div>;
  }

  return (
    <div className="max-w-3xl mx-auto text-sm flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Social Media Generator</h1>
      <GeneratingKeyPoints />
      <KeyPoints keyPoints={component.state.keyPoints} />
      <Posts />
      {component.status === "completed" ? "🎉 Done!" : null}
    </div>
  );
}

export default function SocialMediaGenerator({ params }: Route.ComponentProps) {
  const appId = params.appId;
  return (
    <Synxio.Provider appId={appId}>
      <SocialMediaGeneratorInner />
    </Synxio.Provider>
  );
}
